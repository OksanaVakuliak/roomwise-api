import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExchangeRate } from '@roomwise/calc-engine';
import { type Observable, Subject } from 'rxjs';
import { Clock } from '../../../common/clock/clock';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { RateSource } from '../../../generated/prisma/enums';
import type { ExchangeRateStatus } from './dto/exchange-rate.schema';
import { RATE_FRACTION_DIGITS } from './dto/exchange-rate.schema';
import { isoDate, kyivDate, kyivDateString } from './kyiv-date';
import { NbuClient } from './nbu.client';

const SETTINGS_ID = 1;
const MS_PER_HOUR = 3_600_000;
const STALE_AFTER_HOURS = 26;
const STALE_AFTER_MS = STALE_AFTER_HOURS * MS_PER_HOUR;
const RETRY_AFTER_MS = MS_PER_HOUR;

type RateRow = Prisma.ExchangeRateGetPayload<object>;
type SettingsRow = Prisma.PricingSettingsGetPayload<{
  include: { manualRate: true };
}>;

interface Rates {
  settings: SettingsRow;
  manual: RateRow | null;
  official: RateRow | null;
}

function toQuote(row: RateRow) {
  return {
    rate: row.rate.toFixed(RATE_FRACTION_DIGITS),
    date: isoDate(row.effectiveDate),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly subject = new Subject<void>();
  private refreshing: Promise<void> | null = null;
  private staleCheck: Promise<void> | null = null;
  private checkedUntil = 0;

  readonly changes$: Observable<void> = this.subject.asObservable();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NbuClient) private readonly nbu: NbuClient,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async activeRate(): Promise<ExchangeRate | null> {
    const { manual, official } = await this.readRates();
    const active = manual ?? official;

    return active ? { ...toQuote(active), source: active.source } : null;
  }

  async status(): Promise<ExchangeRateStatus> {
    const { settings, manual, official } = await this.readRates();
    const active = manual ?? official;

    return {
      active: active ? { ...toQuote(active), source: active.source } : null,
      official: official ? toQuote(official) : null,
      manual: manual ? toQuote(manual) : null,
      lastSuccessfulFetchDate: settings.lastNbuSuccessDate
        ? isoDate(settings.lastNbuSuccessDate)
        : null,
      lastAttemptAt: settings.lastNbuAttemptAt?.toISOString() ?? null,
      lastError: settings.lastNbuError,
      staleSince: settings.lastNbuError
        ? settings.lastNbuSuccessDate
          ? isoDate(settings.lastNbuSuccessDate)
          : official
            ? isoDate(official.effectiveDate)
            : null
        : null,
    };
  }

  async isRefreshDue(now: Date): Promise<boolean> {
    const settings = await this.readSettings();

    if (
      settings.lastNbuSuccessDate &&
      isoDate(settings.lastNbuSuccessDate) === kyivDateString(now)
    ) {
      return false;
    }

    return !this.attemptedRecently(settings, now);
  }

  refresh(now: Date): Promise<void> {
    if (!this.refreshing) {
      const refreshing = this.fetchAndStore(now).finally(() => {
        this.refreshing = null;
      });
      this.refreshing = refreshing;
    }

    return this.refreshing;
  }

  requestRefreshIfStale(): void {
    const now = this.clock.now();

    if (this.staleCheck || now.getTime() < this.checkedUntil) {
      return;
    }

    const staleCheck = this.refreshIfStale(now)
      .catch((error: unknown) => {
        this.logger.warn(
          `Background exchange rate refresh failed: ${describeError(error)}`,
        );
      })
      .finally(() => {
        this.staleCheck = null;
      });
    this.staleCheck = staleCheck;
  }

  async setManual(rate: string, adminId: string): Promise<ExchangeRateStatus> {
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      const manualRateId = await this.lockManualRateId(tx);
      const created = await tx.exchangeRate.create({
        data: {
          source: RateSource.MANUAL,
          rate,
          effectiveDate: kyivDate(now),
          fetchedAt: now,
          createdById: adminId,
        },
      });
      await tx.pricingSettings.update({
        where: { id: SETTINGS_ID },
        data: { manualRateId: created.id },
      });

      if (manualRateId) {
        await tx.exchangeRate.delete({ where: { id: manualRateId } });
      }
    });

    this.subject.next();

    return this.status();
  }

  async clearManual(): Promise<ExchangeRateStatus> {
    await this.prisma.$transaction(async (tx) => {
      const manualRateId = await this.lockManualRateId(tx);

      if (!manualRateId) {
        return;
      }

      await tx.pricingSettings.update({
        where: { id: SETTINGS_ID },
        data: { manualRateId: null },
      });
      await tx.exchangeRate.delete({ where: { id: manualRateId } });
    });

    this.subject.next();

    return this.status();
  }

  private async lockManualRateId(
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<Array<{ manual_rate_id: string | null }>>`
      SELECT "manual_rate_id" FROM "pricing_settings" WHERE "id" = ${SETTINGS_ID} FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new Error('Pricing settings are missing; run the seed.');
    }

    return rows[0].manual_rate_id;
  }

  private async refreshIfStale(now: Date): Promise<void> {
    const { settings, official } = await this.readRates();

    if (
      official &&
      now.getTime() - official.fetchedAt.getTime() <= STALE_AFTER_MS
    ) {
      this.checkedUntil = official.fetchedAt.getTime() + STALE_AFTER_MS;
      return;
    }

    if (this.attemptedRecently(settings, now)) {
      this.checkedUntil =
        (settings.lastNbuAttemptAt?.getTime() ?? now.getTime()) +
        RETRY_AFTER_MS;
      return;
    }

    await this.refresh(now);
  }

  private async fetchAndStore(now: Date): Promise<void> {
    let quote: Awaited<ReturnType<NbuClient['fetchUsdRate']>>;

    try {
      quote = await this.nbu.fetchUsdRate();
    } catch (error) {
      this.checkedUntil = now.getTime() + RETRY_AFTER_MS;
      await this.recordFailure(error, now);
      throw error;
    }

    const changed = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.exchangeRate.findFirst({
        where: { source: RateSource.NBU, effectiveDate: quote.effectiveDate },
      });

      if (existing) {
        await tx.exchangeRate.update({
          where: { id: existing.id },
          data: { rate: quote.rate, fetchedAt: now },
        });
      } else {
        await tx.exchangeRate.create({
          data: {
            source: RateSource.NBU,
            rate: quote.rate,
            effectiveDate: quote.effectiveDate,
            fetchedAt: now,
          },
        });
      }

      await tx.pricingSettings.update({
        where: { id: SETTINGS_ID },
        data: {
          lastNbuSuccessDate: kyivDate(now),
          lastNbuAttemptAt: now,
          lastNbuError: null,
        },
      });

      return (
        !existing || existing.rate.toFixed(RATE_FRACTION_DIGITS) !== quote.rate
      );
    });

    this.checkedUntil = now.getTime() + STALE_AFTER_MS;

    if (changed) {
      this.subject.next();
    }
  }

  private async recordFailure(error: unknown, now: Date): Promise<void> {
    try {
      await this.prisma.pricingSettings.update({
        where: { id: SETTINGS_ID },
        data: { lastNbuAttemptAt: now, lastNbuError: describeError(error) },
      });
    } catch (recordingError) {
      this.logger.error(
        `Could not record the NBU failure: ${describeError(recordingError)}`,
      );
    }
  }

  private attemptedRecently(settings: SettingsRow, now: Date): boolean {
    return (
      settings.lastNbuAttemptAt !== null &&
      now.getTime() - settings.lastNbuAttemptAt.getTime() < RETRY_AFTER_MS
    );
  }

  private async readSettings(): Promise<SettingsRow> {
    const settings = await this.prisma.pricingSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: { manualRate: true },
    });

    if (!settings) {
      throw new Error('Pricing settings are missing; run the seed.');
    }

    return settings;
  }

  private async readRates(): Promise<Rates> {
    const [settings, official] = await Promise.all([
      this.readSettings(),
      this.prisma.exchangeRate.findFirst({
        where: { source: RateSource.NBU },
        orderBy: { effectiveDate: 'desc' },
      }),
    ]);

    return { settings, manual: settings.manualRate, official };
  }
}
