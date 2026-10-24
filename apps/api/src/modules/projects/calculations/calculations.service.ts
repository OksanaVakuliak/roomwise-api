import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';
import { Clock } from '../../../common/clock/clock';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { Language } from '../../../common/i18n/resolve-lang';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { IdempotencyKey, Prisma } from '../../../generated/prisma/client';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { langQuerySchema } from '../../catalog/public/dto/lang-query.schema';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { IdempotencyContextValue } from '../idempotency/idempotency-request';
import {
  parseStoredSnapshot,
  VersionViewPresenter,
} from '../presenters/version-view.presenter';
import type { VersionView } from '../presenters/version-view.schema';
import { ProjectsSettingsService } from '../settings/projects-settings.service';
import { SnapshotBuilder } from '../snapshot/snapshot.builder';
import type { SnapshotV1 } from '../snapshot/snapshot.schema';
import type { RecalculateCalculationRequestDto } from './dto/recalculate-calculation.schema';
import {
  type PriceDifference,
  type SaveCalculationRequest,
  type SaveCalculationResponse,
  saveCalculationRequestSchema,
} from './dto/save-calculation.schema';
import type { PriceStatus } from './price-status.schema';
import { PriceStatusService } from './price-status.service';
import { generatePublicId } from './public-id';

const MS_PER_DAY = 86_400_000;

const clientPriceSchema = saveCalculationRequestSchema.pick({
  clientPricingVersion: true,
  clientTotalUsdCents: true,
});

type ClientPrice = Pick<
  SaveCalculationRequest,
  'clientPricingVersion' | 'clientTotalUsdCents'
>;

interface VersionSummary {
  number: number;
  createdAt: Date;
  totalUsdCents: number;
  expiresAt: Date;
}

const VERSION_SUMMARY_SELECT = {
  number: true,
  createdAt: true,
  totalUsdCents: true,
  expiresAt: true,
} as const;

interface LoadedVersion {
  number: number;
  snapshot: SnapshotV1;
  pricingVersion: string;
  totalUsdCents: number;
  incomplete: boolean;
  expiresAt: Date;
  createdAt: Date;
  calculation: {
    publicId: string;
    versions: VersionSummary[];
  };
}

export interface PreparedCalculation {
  snapshot: SnapshotV1;
  now: Date;
  expiresAt: Date;
}

export interface StoredVersionRef {
  id: string;
  number: number;
  expiresAt: Date;
  publicId: string;
}

function expiryOf(now: Date, validityDays: number): Date {
  return new Date(now.getTime() + validityDays * MS_PER_DAY);
}

function versionData(
  calculationId: string,
  number: number,
  snapshot: SnapshotV1,
  expiresAt: Date,
  createdAt: Date,
) {
  return {
    calculationId,
    number,
    snapshot: snapshot as object,
    snapshotSchemaVersion: snapshot.schemaVersion,
    pricingVersion: snapshot.pricingVersion,
    totalUsdCents: snapshot.estimate.totals.usdCents,
    totalUahKopecks: snapshot.estimate.totals.uahKopecks,
    incomplete: snapshot.estimate.incomplete,
    expiresAt,
    createdAt,
  };
}

function priceDifferenceOf(
  client: ClientPrice,
  pricingVersion: string,
  savedTotalUsdCents: number,
): PriceDifference | null {
  if (client.clientPricingVersion === pricingVersion) {
    return null;
  }

  return {
    clientTotalUsdCents: client.clientTotalUsdCents,
    savedTotalUsdCents,
    diffCents: savedTotalUsdCents - client.clientTotalUsdCents,
  };
}

@Injectable()
export class CalculationsService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(SnapshotBuilder) private readonly builder: SnapshotBuilder,
    @Inject(ProjectsSettingsService)
    private readonly settings: ProjectsSettingsService,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
    @Inject(VersionViewPresenter)
    private readonly presenter: VersionViewPresenter,
    @Inject(PriceStatusService)
    private readonly priceStatus: PriceStatusService,
  ) {}

  onModuleInit(): void {
    this.idempotency.registerLoader(IdempotencyScope.SAVE, (row, request) =>
      this.replay(row, request),
    );
    this.idempotency.registerLoader(
      IdempotencyScope.RECALCULATE,
      (row, request) => this.replayRecalculation(row, request),
    );
  }

  async create(
    input: SaveCalculationRequest,
    idempotency: IdempotencyContextValue,
    lang: Language,
  ): Promise<SaveCalculationResponse> {
    const prepared = await this.prepareNew(input);

    const version = await this.prisma.$transaction(async (tx) => {
      const { version: created, calculation } = await this.persistNew(
        tx,
        prepared,
      );
      await this.idempotency.record(tx, {
        ...idempotency,
        resultId: created.id,
      });

      return {
        ...created,
        snapshot: prepared.snapshot,
        calculation: { ...calculation, versions: [created] },
      };
    });

    return this.respond(version, input, lang);
  }

  async prepareNew(
    input: Pick<SaveCalculationRequest, 'configuration' | 'styleId'>,
  ): Promise<PreparedCalculation> {
    const now = this.clock.now();
    const [snapshot, { calculationValidityDays }] = await Promise.all([
      this.builder.build({
        configuration: input.configuration,
        styleId: input.styleId,
        createdAt: now,
      }),
      this.settings.get(),
    ]);

    return {
      snapshot,
      now,
      expiresAt: expiryOf(now, calculationValidityDays),
    };
  }

  async persistNew(
    tx: Prisma.TransactionClient,
    { snapshot, expiresAt, now }: PreparedCalculation,
  ) {
    const calculation = await tx.calculation.create({
      data: { publicId: generatePublicId(), latestVersionNumber: 1 },
    });
    const version = await tx.calculationVersion.create({
      data: versionData(calculation.id, 1, snapshot, expiresAt, now),
    });

    return { version, calculation };
  }

  async findStoredVersion(
    publicId: string,
    number: number,
  ): Promise<StoredVersionRef> {
    const version = await this.prisma.calculationVersion.findFirst({
      where: { number, calculation: { publicId } },
      select: { id: true, number: true, expiresAt: true },
    });

    if (!version) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    return { ...version, publicId };
  }

  async recalculate(
    publicId: string,
    basedOnVersion: RecalculateCalculationRequestDto['basedOnVersion'],
    idempotency: IdempotencyContextValue,
    lang: Language,
  ): Promise<VersionView> {
    const calculation = await this.prisma.calculation.findUnique({
      where: { publicId },
      select: { id: true, publicId: true },
    });
    const base = calculation
      ? await this.prisma.calculationVersion.findUnique({
          where: {
            calculationId_number: {
              calculationId: calculation.id,
              number: basedOnVersion,
            },
          },
        })
      : null;

    if (!calculation || !base) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    const stored = parseStoredSnapshot(base.snapshot);

    if (!stored.style) {
      throw new AppError(ERROR_CODES.STYLE_NOT_FOUND);
    }

    const now = this.clock.now();
    const [snapshot, { calculationValidityDays }] = await Promise.all([
      this.builder.build({
        configuration: stored.configuration,
        styleId: stored.style.id,
        createdAt: now,
        missingProducts: 'unavailable',
      }),
      this.settings.get(),
    ]);
    const expiresAt = expiryOf(now, calculationValidityDays);

    const created = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { latest_version_number: number }[]
      >`SELECT latest_version_number FROM calculations WHERE id = ${calculation.id}::uuid FOR UPDATE`;

      if (!locked) {
        throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
      }

      const number = locked.latest_version_number + 1;
      const version = await tx.calculationVersion.create({
        data: versionData(calculation.id, number, snapshot, expiresAt, now),
      });
      await tx.calculation.update({
        where: { id: calculation.id },
        data: { latestVersionNumber: number },
      });
      await this.idempotency.record(tx, {
        ...idempotency,
        resultId: version.id,
      });

      return version;
    });

    return this.freshView(
      {
        ...created,
        snapshot,
        calculation: {
          publicId: calculation.publicId,
          versions: await this.summariesUpTo(calculation.id, created.number),
        },
      },
      lang,
    );
  }

  async findVersion(
    publicId: string,
    number: number | null,
    lang: Language,
  ): Promise<VersionView> {
    if (number !== null && number < 1) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    const calculation = await this.prisma.calculation.findUnique({
      where: { publicId },
      select: {
        id: true,
        publicId: true,
        latestVersionNumber: true,
        versions: { select: VERSION_SUMMARY_SELECT },
      },
    });

    if (!calculation) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    const version = await this.prisma.calculationVersion.findUnique({
      where: {
        calculationId_number: {
          calculationId: calculation.id,
          number: number ?? calculation.latestVersionNumber,
        },
      },
    });

    if (!version) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    const stored = parseStoredSnapshot(version.snapshot);
    const priceStatus = await this.priceStatus.current({
      id: version.id,
      snapshot: stored,
      totalUsdCents: version.totalUsdCents,
      pricingVersion: version.pricingVersion,
    });

    return this.view(
      { ...version, snapshot: stored, calculation },
      lang,
      this.clock.now(),
      priceStatus,
    );
  }

  private async replay(
    row: IdempotencyKey,
    request: Request,
  ): Promise<SaveCalculationResponse> {
    const version = await this.loadStored(row);
    const { lang } = langQuerySchema.parse(request.query);
    const client = clientPriceSchema.parse(request.body);

    return this.respond(version, client, lang);
  }

  private async replayRecalculation(
    row: IdempotencyKey,
    request: Request,
  ): Promise<VersionView> {
    const version = await this.loadStored(row);
    const { lang } = langQuerySchema.parse(request.query);

    return this.freshView(version, lang);
  }

  private async loadStored(row: IdempotencyKey): Promise<LoadedVersion> {
    const version = await this.prisma.calculationVersion.findUnique({
      where: { id: row.resultId },
      include: { calculation: { select: { id: true, publicId: true } } },
    });

    if (!version) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    return {
      ...version,
      snapshot: parseStoredSnapshot(version.snapshot),
      calculation: {
        ...version.calculation,
        versions: await this.summariesUpTo(
          version.calculationId,
          version.number,
        ),
      },
    };
  }

  private summariesUpTo(
    calculationId: string,
    number: number,
  ): Promise<VersionSummary[]> {
    return this.prisma.calculationVersion.findMany({
      where: { calculationId, number: { lte: number } },
      select: VERSION_SUMMARY_SELECT,
    });
  }

  private respond(
    version: LoadedVersion,
    client: ClientPrice,
    lang: Language,
  ): SaveCalculationResponse {
    return {
      version: this.freshView(version, lang),
      priceDifference: priceDifferenceOf(
        client,
        version.pricingVersion,
        version.totalUsdCents,
      ),
    };
  }

  private freshView(version: LoadedVersion, lang: Language): VersionView {
    return this.view(
      version,
      lang,
      version.createdAt,
      this.priceStatus.fresh(version),
    );
  }

  private view(
    version: LoadedVersion,
    lang: Language,
    now: Date,
    priceStatus: PriceStatus | null,
  ): VersionView {
    return this.presenter.present({
      publicId: version.calculation.publicId,
      version: {
        number: version.number,
        snapshot: version.snapshot,
        pricingVersion: version.pricingVersion,
        incomplete: version.incomplete,
        expiresAt: version.expiresAt,
        createdAt: version.createdAt,
      },
      versions: version.calculation.versions,
      priceStatus,
      lang,
      now,
    });
  }
}
