import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';
import { Clock } from '../../../common/clock/clock';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { Language } from '../../../common/i18n/resolve-lang';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { IdempotencyKey } from '../../../generated/prisma/client';
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
import {
  type PriceDifference,
  type SaveCalculationRequest,
  type SaveCalculationResponse,
  saveCalculationRequestSchema,
} from './dto/save-calculation.schema';
import { generatePublicId } from './public-id';

const MS_PER_DAY = 86_400_000;

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
  snapshot: unknown;
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
  ) {}

  onModuleInit(): void {
    this.idempotency.registerLoader(IdempotencyScope.SAVE, (row, request) =>
      this.replay(row, request),
    );
  }

  async create(
    input: SaveCalculationRequest,
    idempotency: IdempotencyContextValue,
    lang: Language,
  ): Promise<SaveCalculationResponse> {
    const now = this.clock.now();
    const [snapshot, { calculationValidityDays }] = await Promise.all([
      this.builder.build({
        configuration: input.configuration,
        styleId: input.styleId,
        createdAt: now,
      }),
      this.settings.get(),
    ]);
    const expiresAt = new Date(
      now.getTime() + calculationValidityDays * MS_PER_DAY,
    );

    const version = await this.prisma.$transaction(async (tx) => {
      const calculation = await tx.calculation.create({
        data: { publicId: generatePublicId(), latestVersionNumber: 1 },
      });
      const created = await tx.calculationVersion.create({
        data: {
          calculationId: calculation.id,
          number: 1,
          snapshot: snapshot as object,
          snapshotSchemaVersion: snapshot.schemaVersion,
          pricingVersion: snapshot.pricingVersion,
          totalUsdCents: snapshot.estimate.totals.usdCents,
          totalUahKopecks: snapshot.estimate.totals.uahKopecks,
          incomplete: snapshot.estimate.incomplete,
          expiresAt,
          createdAt: now,
        },
      });
      await this.idempotency.record(tx, {
        ...idempotency,
        resultId: created.id,
      });

      return {
        ...created,
        calculation: { ...calculation, versions: [created] },
      };
    });

    return this.respond(version, input, lang);
  }

  async findVersion(
    publicId: string,
    number: number | null,
    lang: Language,
  ): Promise<VersionView> {
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

    return this.view({ ...version, calculation }, lang);
  }

  private async replay(
    row: IdempotencyKey,
    request: Request,
  ): Promise<SaveCalculationResponse> {
    const version = await this.prisma.calculationVersion.findUnique({
      where: { id: row.resultId },
      include: { calculation: { select: { id: true, publicId: true } } },
    });

    if (!version) {
      throw new AppError(ERROR_CODES.CALCULATION_NOT_FOUND);
    }

    const versions = await this.prisma.calculationVersion.findMany({
      where: {
        calculationId: version.calculationId,
        number: { lte: version.number },
      },
      select: VERSION_SUMMARY_SELECT,
    });
    const { lang } = langQuerySchema.parse(request.query);
    const body = saveCalculationRequestSchema.parse(request.body);

    return this.respond(
      { ...version, calculation: { ...version.calculation, versions } },
      body,
      lang,
      row.createdAt,
    );
  }

  private respond(
    version: LoadedVersion,
    client: ClientPrice,
    lang: Language,
    now?: Date,
  ): SaveCalculationResponse {
    return {
      version: this.view(version, lang, now),
      priceDifference: priceDifferenceOf(
        client,
        version.pricingVersion,
        version.totalUsdCents,
      ),
    };
  }

  private view(
    version: LoadedVersion,
    lang: Language,
    now: Date = this.clock.now(),
  ): VersionView {
    return this.presenter.present({
      publicId: version.calculation.publicId,
      version: {
        number: version.number,
        snapshot: parseStoredSnapshot(version.snapshot),
        pricingVersion: version.pricingVersion,
        incomplete: version.incomplete,
        expiresAt: version.expiresAt,
        createdAt: version.createdAt,
      },
      versions: version.calculation.versions,
      lang,
      now,
    });
  }
}
