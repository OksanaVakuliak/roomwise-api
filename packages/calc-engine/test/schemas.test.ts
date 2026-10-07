import { describe, expect, it } from 'vitest';
import {
  ConfigurationSchema,
  EstimateSchema,
  LocalizedTextSchema,
  PricingDataSchema,
} from '../src/schemas';

const name = { en: 'Name', uk: 'Назва' };

const pricingData = {
  version: '0123456789abcdef',
  exchangeRate: { rate: '41.2500', date: '2026-10-07', source: 'NBU' },
  limits: {
    totalAreaSqm: { min: 15, max: 500 },
    rooms: { min: 1, max: 15 },
    roomSideM: { min: 1, max: 30 },
    roomHeightM: { min: 2.2, max: 5 },
  },
  baseRates: [
    {
      finishLevel: 'ROUGH',
      areaFromSqm: 0,
      areaToSqm: 50,
      rateCentsPerSqm: 3000,
    },
  ],
  coefficients: { k_floor: 1.2 },
  rules: [
    {
      id: 'r1',
      level: 'OBJECT',
      categoryId: null,
      materialTypeId: null,
      name,
      quantityFormula: null,
      costFormula: 'totalArea * 2',
      sortOrder: 0,
    },
  ],
  roomTypes: [{ id: 'rt1', code: 'BEDROOM' }],
  categories: [{ id: 'c1', wastePercent: 10, surface: 'FLOOR' }],
  materialTypes: [{ id: 'm1', code: 'LAMINATE' }],
  products: [
    {
      id: 'p1',
      categoryId: 'c1',
      materialTypeId: 'm1',
      priceCents: 1500,
      unit: 'SQM',
      wastePercentOverride: null,
      heatedFloorCompatible: true,
      available: true,
    },
  ],
  packageItems: [
    { id: 'pk1', includedInBase: true, priceCents: null, unit: null },
  ],
  options: [
    {
      id: 'o1',
      kind: 'ADDITIONAL',
      priceCents: 5000,
      unit: 'PIECE',
      roomTypeCodes: ['BEDROOM'],
      minQuantity: 1,
      maxQuantity: 10,
      available: true,
    },
  ],
};

const configuration = {
  finishLevel: 'ROUGH',
  totalAreaSqm: 60,
  balconyAreaSqm: 0,
  balconyTiles: false,
  gas: false,
  kitchenType: 'SEPARATE',
  rooms: [
    {
      clientId: 'a',
      roomTypeCode: 'BEDROOM',
      lengthM: 4,
      widthM: 3,
      heightM: 2.7,
      heatedFloor: false,
      selections: [{ categoryId: 'c1', productId: null }],
    },
  ],
  options: [{ optionId: 'o1', quantity: 2 }],
  currency: 'USD',
};

const zeroTotal = { usdCents: 0, uahKopecks: null };

const estimate = {
  pricingVersion: '0123456789abcdef',
  currency: 'USD',
  exchangeRate: null,
  lines: [
    {
      id: 'BASE',
      section: 'BASE',
      status: 'OK',
      roomClientId: null,
      categoryId: null,
      productId: null,
      optionId: null,
      packageItemId: null,
      ruleId: null,
      quantity: 60,
      unit: 'SQM',
      unitPriceCents: 3000,
      amountCents: 180000,
      amountUahKopecks: null,
      warnings: [],
      error: null,
    },
  ],
  totals: {
    usdCents: 180000,
    uahKopecks: null,
    sections: {
      BASE: { usdCents: 180000, uahKopecks: null },
      OBJECT: zeroTotal,
      MATERIALS: zeroTotal,
      ENGINEERING: zeroTotal,
      ADDITIONAL: zeroTotal,
    },
  },
  warnings: [{ code: 'EXCHANGE_RATE_UNAVAILABLE' }],
  incomplete: false,
};

describe('schemas', () => {
  it('parses a valid LocalizedText and rejects a missing locale', () => {
    expect(LocalizedTextSchema.safeParse(name).success).toBe(true);
    expect(LocalizedTextSchema.safeParse({ en: 'Name' }).success).toBe(false);
  });

  it('parses valid PricingData and allows a null exchange rate', () => {
    expect(PricingDataSchema.safeParse(pricingData).success).toBe(true);
    expect(
      PricingDataSchema.safeParse({ ...pricingData, exchangeRate: null })
        .success,
    ).toBe(true);
  });

  it('rejects PricingData with fractional cents, bad version or missing locale', () => {
    const products = [{ ...pricingData.products[0], priceCents: 10.5 }];
    expect(
      PricingDataSchema.safeParse({ ...pricingData, products }).success,
    ).toBe(false);
    expect(
      PricingDataSchema.safeParse({ ...pricingData, version: 'xyz' }).success,
    ).toBe(false);
    const rules = [{ ...pricingData.rules[0], name: { en: 'Name' } }];
    expect(PricingDataSchema.safeParse({ ...pricingData, rules }).success).toBe(
      false,
    );
  });

  it('parses a valid Configuration and rejects unknown enum values', () => {
    expect(ConfigurationSchema.safeParse(configuration).success).toBe(true);
    expect(
      ConfigurationSchema.safeParse({ ...configuration, currency: 'EUR' })
        .success,
    ).toBe(false);
    const rooms = [{ ...configuration.rooms[0], roomTypeCode: 'GARAGE' }];
    expect(
      ConfigurationSchema.safeParse({ ...configuration, rooms }).success,
    ).toBe(false);
  });

  it('parses a valid Estimate and rejects non-integer cents or a missing section', () => {
    expect(EstimateSchema.safeParse(estimate).success).toBe(true);
    const lines = [{ ...estimate.lines[0], amountCents: 12.5 }];
    expect(EstimateSchema.safeParse({ ...estimate, lines }).success).toBe(
      false,
    );
    const { BASE: _base, ...sections } = estimate.totals.sections;
    expect(
      EstimateSchema.safeParse({
        ...estimate,
        totals: { ...estimate.totals, sections },
      }).success,
    ).toBe(false);
  });
});
