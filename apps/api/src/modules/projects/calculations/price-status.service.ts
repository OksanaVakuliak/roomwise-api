import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PricingEstimateService } from '../../pricing/estimate/pricing-estimate.service';
import { PricingDataService } from '../../pricing/pricing-data/pricing-data.service';
import type { SnapshotV1 } from '../snapshot/snapshot.schema';
import type { PriceStatus } from './price-status.schema';

const CACHE_LIMIT = 1000;

export interface PriceStatusSource {
  id: string;
  snapshot: SnapshotV1;
  totalUsdCents: number;
}

function isUnevaluable(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === ERROR_CODES.UNKNOWN_REFERENCE ||
      error.code === ERROR_CODES.INPUT_OUT_OF_BOUNDS)
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
    const key = `${version.id}:${pricingVersion}`;

    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    const status = await this.evaluate(version);
    this.remember(key, status);

    return status;
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
  ): Promise<PriceStatus | null> {
    try {
      const { estimate, pricingData } = await this.pricingEstimate.estimate(
        version.snapshot.configuration,
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
        changed: diffCents !== 0 || unavailableItems.length > 0,
        snapshotTotalUsdCents: version.totalUsdCents,
        currentTotalUsdCents: estimate.totals.usdCents,
        diffCents,
        unavailableItems,
        currentPricingVersion: pricingData.version,
      };
    } catch (error) {
      if (isUnevaluable(error)) {
        return null;
      }
      throw error;
    }
  }

  private remember(key: string, status: PriceStatus | null): void {
    this.cache.set(key, status);

    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }
}
