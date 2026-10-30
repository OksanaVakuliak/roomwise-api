import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PricingEstimateService } from '../../pricing/estimate/pricing-estimate.service';
import { PricingDataService } from '../../pricing/pricing-data/pricing-data.service';
import { retiredOptionsOf } from '../snapshot/retired-options';
import type { SnapshotV1 } from '../snapshot/snapshot.schema';
import type { PriceStatus } from './price-status.schema';

const CACHE_LIMIT = 1000;

export interface PriceStatusSource {
  id: string;
  snapshot: SnapshotV1;
  totalUsdCents: number;
  pricingVersion: string;
}

function isUnevaluable(error: unknown): boolean {
  return (
    error instanceof AppError && error.code === ERROR_CODES.UNKNOWN_REFERENCE
  );
}

@Injectable()
export class PriceStatusService {
  private readonly cache = new Map<string, PriceStatus | null>();

  constructor(
    @Inject(PricingDataService)
    private readonly pricingData: PricingDataService,
    @Inject(PricingEstimateService)
    private readonly pricingEstimate: PricingEstimateService,
  ) {}

  async current(version: PriceStatusSource): Promise<PriceStatus | null> {
    const { version: pricingVersion } = await this.pricingData.get();

    if (version.pricingVersion === pricingVersion) {
      return this.fresh(version);
    }

    const lookupKey = `${version.id}:${pricingVersion}`;
    const cached = this.recall(lookupKey);

    if (cached !== undefined) {
      return cached;
    }

    const evaluation = await this.evaluate(version);
    const key =
      evaluation.pricingVersion === null
        ? lookupKey
        : `${version.id}:${evaluation.pricingVersion}`;
    this.remember(key, evaluation.status);

    return evaluation.status;
  }

  fresh(version: {
    totalUsdCents: number;
    pricingVersion: string;
  }): PriceStatus {
    return {
      changed: false,
      snapshotTotalUsdCents: version.totalUsdCents,
      currentTotalUsdCents: version.totalUsdCents,
      diffCents: 0,
      unavailableItems: [],
      currentPricingVersion: version.pricingVersion,
    };
  }

  private async evaluate(
    version: PriceStatusSource,
  ): Promise<{ status: PriceStatus | null; pricingVersion: string | null }> {
    try {
      const { estimate, pricingData } = await this.pricingEstimate.estimate(
        version.snapshot.configuration,
        {
          missingReferences: 'unavailable',
          limits: 'skip',
          retiredOptions: retiredOptionsOf(version.snapshot),
        },
      );
      const alreadyUnavailable = new Set(
        version.snapshot.lines
          .filter((line) => line.status === 'UNAVAILABLE')
          .map((line) => line.id),
      );
      const unavailableItems = estimate.lines
        .filter(
          (line) =>
            line.status === 'UNAVAILABLE' && !alreadyUnavailable.has(line.id),
        )
        .map((line) => ({
          lineId: line.id,
          productId: line.productId,
          optionId: line.optionId,
        }));
      const diffCents = estimate.totals.usdCents - version.totalUsdCents;

      return {
        status: {
          changed: diffCents !== 0 || unavailableItems.length > 0,
          snapshotTotalUsdCents: version.totalUsdCents,
          currentTotalUsdCents: estimate.totals.usdCents,
          diffCents,
          unavailableItems,
          currentPricingVersion: pricingData.version,
        },
        pricingVersion: pricingData.version,
      };
    } catch (error) {
      if (isUnevaluable(error)) {
        return { status: null, pricingVersion: null };
      }
      throw error;
    }
  }

  private recall(key: string): PriceStatus | null | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const status = this.cache.get(key) ?? null;
    this.cache.delete(key);
    this.cache.set(key, status);

    return status;
  }

  private remember(key: string, status: PriceStatus | null): void {
    this.cache.delete(key);
    this.cache.set(key, status);

    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }
}
