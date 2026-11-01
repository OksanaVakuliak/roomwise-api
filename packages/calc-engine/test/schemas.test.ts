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
    missingAreaHintSqm: 5,
  },
  coefficients: { k_floor: 1.2 },
  rules: [
    {
      id: 'r1',
      level: 'OBJECT',
      categoryId: null,
      materialTypeId: null,
      name,
      surface: null,
      baseComponent: false,
      quantityFormula: null,
      costFormula: 'totalArea * 2',
      laborFormula: null,
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
      code: null,
      kind: 'ADDITIONAL',
      priceCents: 5000,
      unit: 'PIECE',
      roomTypeCodes: ['BEDROOM'],
      priceCoefficientKeys: [],
      scopes: ['FULL', 'PARTIAL'],
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

  it('defaults the scope to FULL', () => {
    const result = ConfigurationSchema.safeParse(configuration);
    expect(result.data?.scope).toBe('FULL');
  });

  it('requires the total area for FULL and forbids it for PARTIAL', () => {
    const parse = (value: unknown) => ConfigurationSchema.safeParse(value);
    const partial = { ...configuration, scope: 'PARTIAL' };
    expect(parse({ ...partial, totalAreaSqm: null }).success).toBe(true);
    const tooMuch = parse({ ...partial, totalAreaSqm: 40 });
    expect(tooMuch.success).toBe(false);
    expect(tooMuch.error?.issues[0].path).toEqual(['totalAreaSqm']);
    const missing = parse({ ...configuration, totalAreaSqm: null });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].path).toEqual(['totalAreaSqm']);
    expect(parse({ ...configuration, scope: 'FULL' }).success).toBe(true);
    expect(parse({ ...configuration, scope: 'HALF' }).success).toBe(false);
  });

  it('accepts hallway and storage rooms and the lived-in finish level', () => {
    const rooms = ['HALLWAY', 'STORAGE'].map((roomTypeCode, index) => ({
      ...configuration.rooms[0],
      clientId: `x${index}`,
      roomTypeCode,
    }));
    expect(
      ConfigurationSchema.safeParse({ ...configuration, rooms }).success,
    ).toBe(true);
    expect(
      ConfigurationSchema.safeParse({
        ...configuration,
        finishLevel: 'LIVED_IN',
      }).success,
    ).toBe(true);
  });

  it('validates the optional room name', () => {
    const withName = (name: unknown) =>
      ConfigurationSchema.safeParse({
        ...configuration,
        rooms: [{ ...configuration.rooms[0], name }],
      });

    expect(withName('Master bedroom').success).toBe(true);
    expect(withName('a'.repeat(60)).success).toBe(true);
    expect(withName('  Kids room  ').data?.rooms[0].name).toBe('Kids room');
    expect(withName(undefined).data?.rooms[0].name).toBeUndefined();
    expect(withName('').success).toBe(false);
    expect(withName('   ').success).toBe(false);
    expect(withName('a'.repeat(61)).success).toBe(false);
    expect(withName(7).success).toBe(false);
  });

  it('rejects duplicate room ids, categories in a room and option ids', () => {
    const room = configuration.rooms[0];
    const issuePaths = (value: unknown) => {
      const result = ConfigurationSchema.safeParse(value);
      return result.success
        ? []
        : result.error.issues.map((issue) => issue.path);
    };
    expect(
      issuePaths({ ...configuration, rooms: [room, { ...room }] }),
    ).toEqual([['rooms', 1, 'clientId']]);
    expect(
      issuePaths({
        ...configuration,
        rooms: [
          {
            ...room,
            selections: [...room.selections, ...room.selections],
          },
        ],
      }),
    ).toEqual([['rooms', 0, 'selections', 1, 'categoryId']]);
    expect(
      issuePaths({
        ...configuration,
        options: [...configuration.options, ...configuration.options],
      }),
    ).toEqual([['options', 1, 'optionId']]);
  });

  it('requires a quantity formula for material rules only', () => {
    const [objectRule] = pricingData.rules;
    const parse = (rule: unknown) =>
      PricingDataSchema.safeParse({ ...pricingData, rules: [rule] });
    expect(parse({ ...objectRule, quantityFormula: 'totalArea' }).success).toBe(
      false,
    );
    const materialRule = {
      ...objectRule,
      level: 'CATEGORY',
      categoryId: 'c1',
    };
    const result = parse(materialRule);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([
      'rules',
      0,
      'quantityFormula',
    ]);
    expect(
      parse({ ...materialRule, quantityFormula: 'floorArea' }).success,
    ).toBe(true);
  });

  it('shapes pricing rules by level', () => {
    const base = {
      ...pricingData.rules[0],
      surface: null,
      baseComponent: false,
      laborFormula: null,
    };
    const parse = (rule: unknown) =>
      PricingDataSchema.safeParse({ ...pricingData, rules: [rule] });
    const surfaceRule = {
      ...base,
      level: 'SURFACE',
      surface: 'FLOOR',
      quantityFormula: null,
    };
    expect(parse(surfaceRule).success).toBe(true);
    expect(parse({ ...surfaceRule, surface: null }).success).toBe(false);
    expect(parse({ ...surfaceRule, categoryId: 'c1' }).success).toBe(false);
    expect(
      parse({ ...surfaceRule, quantityFormula: 'floorArea' }).success,
    ).toBe(false);
    expect(parse({ ...surfaceRule, laborFormula: 'floorArea' }).success).toBe(
      false,
    );
    expect(parse({ ...base, surface: 'FLOOR' }).success).toBe(false);

    expect(parse({ ...base, baseComponent: true }).success).toBe(true);
    const materialRule = {
      ...base,
      level: 'CATEGORY',
      categoryId: 'c1',
      quantityFormula: 'floorArea',
    };
    expect(parse(materialRule).success).toBe(true);
    expect(parse({ ...materialRule, baseComponent: true }).success).toBe(false);
    expect(parse({ ...materialRule, laborFormula: 'floorArea' }).success).toBe(
      true,
    );
    expect(parse({ ...base, laborFormula: 'totalArea' }).success).toBe(false);
  });

  it('shapes pricing options with coefficient keys and scopes', () => {
    const option = {
      ...pricingData.options[0],
      priceCoefficientKeys: ['k_floor'],
      scopes: ['FULL', 'PARTIAL'],
    };
    const parse = (value: unknown) =>
      PricingDataSchema.safeParse({ ...pricingData, options: [value] });
    expect(parse(option).success).toBe(true);
    expect(parse({ ...option, priceCoefficientKeys: [] }).success).toBe(true);
    expect(parse({ ...option, priceCoefficientKeys: 'k_floor' }).success).toBe(
      false,
    );
    expect(parse({ ...option, scopes: [] }).success).toBe(false);
    expect(parse({ ...option, scopes: ['HALF'] }).success).toBe(false);
  });

  it('parses line components and rejects malformed ones', () => {
    const ruleId = '3f1c2b4e-5a6d-4e7f-8a9b-0c1d2e3f4a5b';
    const categoryId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    const parse = (components: unknown) =>
      EstimateSchema.safeParse({
        ...estimate,
        lines: [{ ...estimate.lines[0], components }],
      });
    const component = { kind: 'MATERIAL', ruleId, amountCents: 100 };
    expect(parse(undefined).success).toBe(true);
    expect(parse([]).success).toBe(true);
    expect(
      parse([
        component,
        { kind: 'LABOR', ruleId, amountCents: 0 },
        { ...component, kind: 'PREP', sharedWithCategoryId: categoryId },
      ]).success,
    ).toBe(true);
    expect(parse([{ ...component, kind: 'OTHER' }]).success).toBe(false);
    expect(parse([{ ...component, ruleId: 1 }]).success).toBe(false);
    expect(parse([{ ...component, amountCents: -1 }]).success).toBe(false);
    expect(parse([{ ...component, amountCents: 1.5 }]).success).toBe(false);
    expect(parse([{ ...component, sharedWithCategoryId: 1 }]).success).toBe(
      false,
    );
  });

  it('accepts the renovation scope message codes with params', () => {
    const messages = [
      { code: 'LABOR_RATE_MISSING' },
      { code: 'OPTION_SCOPE_NOT_ALLOWED' },
      { code: 'ROOMS_AREA_BELOW_TOTAL', params: { missingSqm: 12.5 } },
    ];
    const lines = [{ ...estimate.lines[0], warnings: [messages[0]] }];
    expect(
      EstimateSchema.safeParse({ ...estimate, lines, warnings: messages })
        .success,
    ).toBe(true);
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
