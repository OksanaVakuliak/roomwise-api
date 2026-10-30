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

  it('estimates values outside the limits when limits are skipped', async () => {
    const result = await createService().estimate(
      configuration({ totalAreaSqm: 5 }),
      { limits: 'skip' },
    );

    expect(result.estimate).toBeDefined();
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

  it('estimates a deleted product as unavailable when asked to', async () => {
    const withProduct = configuration({
      rooms: [
        {
          ...room,
          selections: [{ categoryId: 'cat-1', productId: 'deleted' }],
        },
      ],
    });
    const service = new PricingEstimateService({
      get: vi.fn().mockResolvedValue({
        ...data,
        categories: [{ id: 'cat-1', wastePercent: 0, surface: 'FLOOR' }],
      }),
    } as unknown as PricingDataService);

    await expect(service.estimate(withProduct)).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN_REFERENCE,
    });

    const result = await service.estimate(withProduct, {
      missingReferences: 'unavailable',
    });

    expect(result.estimate.lines).toContainEqual(
      expect.objectContaining({ productId: 'deleted', status: 'UNAVAILABLE' }),
    );
  });

  describe('retired options', () => {
    const retiredOptions = [{ id: 'opt-gone', kind: 'ADDITIONAL' as const }];
    const withOption = configuration({ options: [{ optionId: 'opt-gone' }] });

    it('estimates a deleted option as unavailable without touching catalog data', async () => {
      const cached = { ...data, options: [] };
      const service = new PricingEstimateService({
        get: vi.fn().mockResolvedValue(cached),
      } as unknown as PricingDataService);

      const result = await service.estimate(withOption, {
        missingReferences: 'unavailable',
        retiredOptions,
      });

      expect(result.estimate.lines).toContainEqual(
        expect.objectContaining({
          optionId: 'opt-gone',
          section: 'ADDITIONAL',
          status: 'UNAVAILABLE',
        }),
      );
      expect(result.pricingData.options).toEqual([]);
      expect(cached.options).toEqual([]);
    });

    it('drops a deleted option that has no retired entry', async () => {
      const result = await createService().estimate(withOption, {
        missingReferences: 'unavailable',
      });

      expect(
        result.estimate.lines.filter((line) => line.optionId !== null),
      ).toEqual([]);
    });

    it('rejects a deleted option under the default policy', async () => {
      await expect(
        createService().estimate(withOption, { retiredOptions }),
      ).rejects.toMatchObject({ code: ERROR_CODES.UNKNOWN_REFERENCE });
    });
  });
});
