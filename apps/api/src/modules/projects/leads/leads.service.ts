import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
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
  type PreparedCalculation,
  type StoredVersionRef,
} from '../calculations/calculations.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { IdempotencyContextValue } from '../idempotency/idempotency-request';
import { ProjectsSettingsService } from '../settings/projects-settings.service';
import type {
  CreateLeadRequest,
  CreateLeadResponse,
  LeadFormSettings,
} from './dto/create-lead.schema';
import { normalizePhone } from './phone.schema';

const DAYS_PLACEHOLDER = /\{days\}/g;

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
): CreateLeadResponse {
  return {
    leadNumber,
    calculation: {
      publicId: version.publicId,
      versionNumber: version.number,
    },
    expiredAtSubmission,
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
    this.idempotency.registerLoader(IdempotencyScope.LEAD, (row) =>
      this.replay(row),
    );
  }

  async create(
    input: CreateLeadRequest,
    idempotency: IdempotencyContextValue,
  ): Promise<CreateLeadResponse> {
    const phone = normalizePhone(input.phone);
    const prepared = input.draft
      ? await this.calculations.prepareNew(input.draft)
      : null;
    const existing = input.calculation
      ? await this.calculations.findStoredVersion(
          input.calculation.publicId,
          input.calculation.versionNumber,
        )
      : null;
    const isSpam = (input.website ?? '').trim().length > 0;

    return this.prisma.$transaction(async (tx) => {
      const version = existing ?? (await this.persistDraft(tx, prepared));
      const now = this.clock.now();
      const expiredAtSubmission = isExpired(version.expiresAt, now);

      if (isSpam) {
        const leadNumber = await this.nextLeadNumber(tx);
        await this.idempotency.record(tx, {
          ...idempotency,
          resultId: version.id,
          fakeLeadNumber: leadNumber,
        });

        return responseOf(leadNumber, version, expiredAtSubmission);
      }

      const lead = await tx.lead.create({
        data: {
          calculationVersionId: version.id,
          name: input.name.trim(),
          phone,
          email: input.email,
          comment: input.comment,
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

      return responseOf(lead.number, version, expiredAtSubmission);
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

  private async replay(row: IdempotencyKey): Promise<CreateLeadResponse> {
    if (row.fakeLeadNumber !== null) {
      const version = await this.prisma.calculationVersion.findUniqueOrThrow({
        where: { id: row.resultId },
        select: {
          number: true,
          expiresAt: true,
          calculation: { select: { publicId: true } },
        },
      });

      return responseOf(
        row.fakeLeadNumber,
        { publicId: version.calculation.publicId, number: version.number },
        isExpired(version.expiresAt, row.createdAt),
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
            calculation: { select: { publicId: true } },
          },
        },
      },
    });

    return responseOf(
      lead.number,
      {
        publicId: lead.calculationVersion.calculation.publicId,
        number: lead.calculationVersion.number,
      },
      lead.expiredAtSubmission,
    );
  }
}
