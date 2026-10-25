import type {
  Configuration,
  Estimate,
  PricingData,
} from '@roomwise/calc-engine';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { PricingEstimateService } from '../estimate/pricing-estimate.service';
import type { PricingDataService } from '../pricing-data/pricing-data.service';
import { PublicPricingController } from './public-pricing.controller';

const VERSION = '0123456789abcdef';

const data = { version: VERSION } as unknown as PricingData;
const estimateResult = { totalCents: 1 } as unknown as Estimate;

function createController(): PublicPricingController {
  const pricingData = {
    get: vi.fn().mockResolvedValue(data),
  } as unknown as PricingDataService;
  const pricingEstimate = {
    estimate: vi
      .fn()
      .mockResolvedValue({ estimate: estimateResult, pricingData: data }),
  } as unknown as PricingEstimateService;
  return new PublicPricingController(pricingData, pricingEstimate);
}

const configuration = {} as Configuration;

describe('PublicPricingController', () => {
  it('sets ETag and Cache-Control on the pricing data', async () => {
    const response = { setHeader: vi.fn() };

    const result = await createController().getPricingData(
      response as unknown as Response,
    );

    expect(result).toBe(data);
    expect(response.setHeader).toHaveBeenCalledWith('ETag', `"${VERSION}"`);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30',
    );
  });

  it('marks the estimate stale when the client version differs', async () => {
    const result = await createController().createEstimate({
      configuration,
      clientPricingVersion: 'fedcba9876543210',
    });

    expect(result.estimate).toBe(estimateResult);
    expect(result.stale).toBe(true);
    expect(result.pricingVersion).toBe(VERSION);
  });

  it('does not mark the estimate stale without a client version', async () => {
    const result = await createController().createEstimate({ configuration });

    expect(result.stale).toBe(false);
  });

  it('does not mark the estimate stale when the client version matches', async () => {
    const result = await createController().createEstimate({
      configuration,
      clientPricingVersion: VERSION,
    });

    expect(result.stale).toBe(false);
  });
});
