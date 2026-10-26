import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Clock } from '../../../common/clock/clock';
import type { Language } from '../../../common/i18n/resolve-lang';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { IdempotencyKey, Prisma } from '../../../generated/prisma/client';
import {
  IdempotencyScope,
  LeadStatus,
  Locale,
} from '../../../generated/prisma/enums';
import {
  CalculationsService,
  clientPriceSchema,
  type PreparedCalculation,
  priceDifferenceOf,
  type StoredVersionRef,
} from '../calculations/calculations.service';
import type { PriceDifference } from '../calculations/dto/save-calculation.schema';
import { publicIdFromUuid } from '../calculations/public-id';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { IdempotencyContextValue } from '../idempotency/idempotency-request';
import { ProjectsSettingsService } from '../settings/projects-settings.service';
import type {
  CreateLeadRequest,
  CreateLeadResponse,
  LeadFormSettings,
} from './dto/create-lead.schema';
import { normalizePhone } from './phone.schema';

const FAKE_VERSION_NUMBER = 1;
const DAYS_PLACEHOLDER = /\{days\}/g;

const replayedDraftPriceSchema = z.object({
  draft: clientPriceSchema.optional(),
});

const LOCALE_BY_LANGUAGE: Record<Language, Locale> = {
  en: Locale.EN,
  uk: Locale.UK,
};

function isExpired(expiresAt: Date, at: Date): boolean {
  return expiresAt.getTime() <= at.getTime();
}

function responseOf(
  leadNumber: number,
  version: Pick<StoredVersionRef, 'publicId' | 'number'>,
  expiredAtSubmission: boolean,
  priceDifference: PriceDifference | null,
): CreateLeadResponse {
  return {
    leadNumber,
    calculation: {
      publicId: version.publicId,
      versionNumber: version.number,
    },
    expiredAtSubmission,
    priceDifference,
  };
}

@Injectable()
export class LeadsService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(CalculationsService)
    private readonly calculations: CalculationsService,
    @Inject(ProjectsSettingsService)
    private readonly settings: ProjectsSettingsService,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
  ) {}

  onModuleInit(): void {
    this.idempotency.registerLoader(IdempotencyScope.LEAD, (row, request) =>
      this.replay(row, request),
    );
  }

  async create(
    input: CreateLeadRequest,
    idempotency: IdempotencyContextValue,
  ): Promise<CreateLeadResponse> {
    const phone = normalizePhone(input.phone);

    if ((input.website ?? '').trim().length > 0) {
      return this.createFake(idempotency);
    }

    const prepared = input.draft
      ? await this.calculations.prepareNew(input.draft)
      : null;
    const priceDifference =
      input.draft && prepared
        ? priceDifferenceOf(
            input.draft,
            prepared.snapshot.pricingVersion,
            prepared.snapshot.estimate.totals.usdCents,
          )
        : null;
    const existing = input.calculation
      ? await this.calculations.findStoredVersion(
          input.calculation.publicId,
          input.calculation.versionNumber,
        )
      : null;

    return this.prisma.$transaction(async (tx) => {
      const version = existing ?? (await this.persistDraft(tx, prepared));
      const now = this.clock.now();
      const expiredAtSubmission = isExpired(version.expiresAt, now);

      const lead = await tx.lead.create({
        data: {
          calculationVersionId: version.id,
          name: input.name,
          phone,
          email: input.email || null,
          comment: input.comment || null,
          consentText: input.consent.text,
          consentAt: now,
          locale: LOCALE_BY_LANGUAGE[input.locale],
          expiredAtSubmission,
          statusChanges: {
            create: { fromStatus: null, toStatus: LeadStatus.NEW },
          },
        },
      });
      await this.idempotency.record(tx, { ...idempotency, resultId: lead.id });

      return responseOf(
        lead.number,
        version,
        expiredAtSubmission,
        priceDifference,
      );
    });
  }

  async formSettings(lang: Language): Promise<LeadFormSettings> {
    const { leadRetentionDays, leadFormNotice } = await this.settings.get();

    return {
      retentionDays: leadRetentionDays,
      notice: leadFormNotice[lang].replace(
        DAYS_PLACEHOLDER,
        String(leadRetentionDays),
      ),
    };
  }

  private createFake(
    idempotency: IdempotencyContextValue,
  ): Promise<CreateLeadResponse> {
    return this.prisma.$transaction(async (tx) => {
      const leadNumber = await this.nextLeadNumber(tx);
      const resultId = randomUUID();
      await this.idempotency.record(tx, {
        ...idempotency,
        resultId,
        fakeLeadNumber: leadNumber,
        createdAt: this.clock.now(),
      });

      return responseOf(
        leadNumber,
        { publicId: publicIdFromUuid(resultId), number: FAKE_VERSION_NUMBER },
        false,
        null,
      );
    });
  }

  private async persistDraft(
    tx: Prisma.TransactionClient,
    prepared: PreparedCalculation | null,
  ): Promise<StoredVersionRef> {
    if (!prepared) {
      throw new Error('Lead has neither a calculation nor a draft');
    }

    const { version, calculation } = await this.calculations.persistNew(
      tx,
      prepared,
    );

    return {
      id: version.id,
      number: version.number,
      expiresAt: version.expiresAt,
      publicId: calculation.publicId,
    };
  }

  private async nextLeadNumber(tx: Prisma.TransactionClient): Promise<number> {
    const [row] = await tx.$queryRaw<
      { number: number }[]
    >`SELECT nextval(pg_get_serial_sequence('leads', 'number'))::int AS number`;

    if (!row) {
      throw new Error('Lead number sequence returned no value');
    }

    return row.number;
  }

  private async replay(
    row: IdempotencyKey,
    request: Request,
  ): Promise<CreateLeadResponse> {
    if (row.fakeLeadNumber !== null) {
      return responseOf(
        row.fakeLeadNumber,
        {
          publicId: publicIdFromUuid(row.resultId),
          number: FAKE_VERSION_NUMBER,
        },
        false,
        null,
      );
    }

    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: row.resultId },
      select: {
        number: true,
        expiredAtSubmission: true,
        calculationVersion: {
          select: {
            number: true,
            pricingVersion: true,
            totalUsdCents: true,
            calculation: { select: { publicId: true } },
          },
        },
      },
    });

    const { draft } = replayedDraftPriceSchema.parse(request.body);
    const version = lead.calculationVersion;

    return responseOf(
      lead.number,
      { publicId: version.calculation.publicId, number: version.number },
      lead.expiredAtSubmission,
      draft
        ? priceDifferenceOf(
            draft,
            version.pricingVersion,
            version.totalUsdCents,
          )
        : null,
    );
  }
}
