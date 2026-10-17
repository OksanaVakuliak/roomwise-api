import type { Configuration, PricingData } from '@roomwise/calc-engine';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PricingDataService } from '../pricing-data/pricing-data.service';
import { PublicPricingController } from './public-pricing.controller';

const VERSION = '0123456789abcdef';

const data = {
  version: VERSION,
  exchangeRate: null,
  limits: {
    totalAreaSqm: { min: 15, max: 500 },
    rooms: { min: 1, max: 10 },
    roomSideM: { min: 1, max: 20 },
    roomHeightM: { min: 2.2, max: 5 },
  },
  baseRates: [
    {
      finishLevel: 'ROUGH',
      areaFromSqm: 0,
      areaToSqm: 1000,
      rateCentsPerSqm: 1000,
    },
  ],
  coefficients: {},
  rules: [],
  roomTypes: [{ id: 'rt-1', code: 'BEDROOM' }],
  categories: [],
  materialTypes: [],
  products: [],
  packageItems: [],
  options: [],
} as unknown as PricingData;

function createController(): PublicPricingController {
  const service = {
    get: vi.fn().mockResolvedValue(data),
  } as unknown as PricingDataService;
  return new PublicPricingController(service);
}

const room: Configuration['rooms'][number] = {
  clientId: 'room-1',
  roomTypeCode: 'BEDROOM',
  lengthM: 4,
  widthM: 3,
  heightM: 2.7,
  heatedFloor: false,
  selections: [],
};

function configuration(overrides: Partial<Configuration>): Configuration {
  return {
    finishLevel: 'ROUGH',
    totalAreaSqm: 50,
    balconyAreaSqm: 0,
    balconyTiles: false,
    gas: false,
    kitchenType: 'SEPARATE',
    rooms: [room],
    options: [],
    currency: 'USD',
    ...overrides,
  };
}

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
      configuration: configuration({}),
      clientPricingVersion: 'fedcba9876543210',
    });

    expect(result.stale).toBe(true);
    expect(result.pricingVersion).toBe(VERSION);
  });

  it('does not mark the estimate stale without a client version', async () => {
    const result = await createController().createEstimate({
      configuration: configuration({}),
    });

    expect(result.stale).toBe(false);
  });

  it('rejects values outside the limits', async () => {
    const rejection = createController().createEstimate({
      configuration: configuration({ totalAreaSqm: 5 }),
    });

    await expect(rejection).rejects.toMatchObject({
      code: ERROR_CODES.INPUT_OUT_OF_BOUNDS,
      params: {
        violations: expect.arrayContaining([
          { field: 'totalAreaSqm', min: 15, max: 500 },
        ]),
      },
    });
    await expect(rejection).rejects.toBeInstanceOf(AppError);
  });

  it('rejects unknown references', async () => {
    const rejection = createController().createEstimate({
      configuration: configuration({
        options: [{ optionId: 'missing' }],
      }),
    });

    await expect(rejection).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN_REFERENCE,
      params: { references: [{ field: 'options[0].optionId', id: 'missing' }] },
    });
  });
});
