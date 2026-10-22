import type { Configuration, PricingData } from '@roomwise/calc-engine';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PricingDataService } from '../pricing-data/pricing-data.service';
import { PricingEstimateService } from './pricing-estimate.service';

const data = {
  version: '0123456789abcdef',
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

function createService(): PricingEstimateService {
  const pricingData = {
    get: vi.fn().mockResolvedValue(data),
  } as unknown as PricingDataService;
  return new PricingEstimateService(pricingData);
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

describe('PricingEstimateService', () => {
  it('returns the estimate with the pricing data it was computed from', async () => {
    const result = await createService().estimate(configuration({}));

    expect(result.pricingData).toBe(data);
    expect(result.estimate).toBeDefined();
  });

  it('rejects values outside the limits', async () => {
    const rejection = createService().estimate(
      configuration({ totalAreaSqm: 5 }),
    );

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
    const rejection = createService().estimate(
      configuration({ options: [{ optionId: 'missing' }] }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN_REFERENCE,
      params: { references: [{ field: 'options[0].optionId', id: 'missing' }] },
    });
  });
});
