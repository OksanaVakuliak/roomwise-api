import { describe, expect, it } from 'vitest';
import { type Configuration, estimate, type PricingData } from '../src';
import {
  CATEGORY,
  fullConfiguration,
  PRODUCT,
  partialConfiguration,
  RULE,
  room,
  scopeData,
  select,
} from './fixtures/scope';
import { expectEstimateInvariants } from './support/invariants';

const underlay = { en: 'Underlay', uk: 'Підкладка' };
const glue = { en: 'Tile glue', uk: 'Клей для плитки' };
const heatedGlue = { en: 'Heated floor glue', uk: 'Клей для теплої підлоги' };

const tileCategory = 'cat-floor-tile';
const tileProduct = 'p-floor-tile';
const tileRule = '00000000-0000-4000-8000-000000000031';
const exchangeRate = {
  rate: '41.2500',
  date: '2026-11-08',
  source: 'NBU',
} as const;

const withAccessories: PricingData = {
  ...scopeData,
  coefficients: { ...scopeData.coefficients, tile_glue_heated: 14 },
  accessories: {
    laminate_underlay: underlay,
    tile_glue: glue,
    tile_glue_heated: heatedGlue,
  },
  categories: [
    ...scopeData.categories,
    {
      id: tileCategory,
      wastePercent: 0,
      surface: 'FLOOR',
      requiresPutty: true,
    },
  ],
  products: [
    ...scopeData.products,
    {
      id: tileProduct,
      categoryId: tileCategory,
      materialTypeId: 'mt-generic',
      priceCents: 4000,
      unit: 'SQM',
      wastePercentOverride: null,
      heatedFloorCompatible: true,
      available: true,
    },
  ],
  rules: [
    ...scopeData.rules,
    {
      id: tileRule,
      level: 'CATEGORY',
      categoryId: tileCategory,
      materialTypeId: null,
      name: { en: 'Rule', uk: 'Правило' },
      quantityFormula: 'floorArea',
      surface: null,
      baseComponent: false,
      costFormula:
        'quantity * (price + (heatedFloor ? coef.tile_glue_heated : coef.tile_glue))',
      laborFormula: null,
      sortOrder: 0,
    },
  ],
};

const lineOf = (
  data: PricingData,
  configuration: Configuration,
  categoryId: string,
) => {
  const result = estimate(configuration, data);
  expectEstimateInvariants(result);
  const line = result.lines.find(
    (item) => item.id === `MATERIALS:bedroom:${categoryId}`,
  );
  if (line === undefined) {
    throw new Error('line not found');
  }
  return line;
};

const componentsSum = (line: ReturnType<typeof lineOf>) =>
  (line.components ?? []).reduce((total, item) => total + item.amountCents, 0);

const fullBedroom = (categoryId: string, productId: string, heated = false) =>
  fullConfiguration({
    rooms: [
      room('bedroom', {
        heatedFloor: heated,
        selections: [select(categoryId, productId)],
      }),
    ],
  });

const partialBedroom = (categoryId: string, productId: string) =>
  partialConfiguration({
    rooms: [room('bedroom', { selections: [select(categoryId, productId)] })],
  });

const withCostFormula = (
  data: PricingData,
  ruleId: string,
  costFormula: string,
): PricingData => ({
  ...data,
  rules: data.rules.map((rule) =>
    rule.id === ruleId ? { ...rule, costFormula } : rule,
  ),
});

describe('accessory components', () => {
  it('splits the underlay of a laminate line in FULL', () => {
    const line = lineOf(
      withAccessories,
      fullBedroom(CATEGORY.floor, PRODUCT.floor),
      CATEGORY.floor,
    );
    expect(line.amountCents).toBe(26400);
    expect(line.components).toEqual([
      { kind: 'MATERIAL', ruleId: RULE.floor, amountCents: 24000 },
      {
        kind: 'ACCESSORY',
        ruleId: RULE.floor,
        coefficientKey: 'laminate_underlay',
        amountCents: 2400,
      },
    ]);
    expect(componentsSum(line)).toBe(line.amountCents);
  });

  it('keeps the amount identical to the unsplit line', () => {
    const configuration = fullBedroom(CATEGORY.floor, PRODUCT.floor);
    const split = lineOf(withAccessories, configuration, CATEGORY.floor);
    const plain = lineOf(scopeData, configuration, CATEGORY.floor);
    expect(split.amountCents).toBe(plain.amountCents);
    expect(split.quantity).toBe(plain.quantity);
    expect(split.unitPriceCents).toBe(plain.unitPriceCents);
  });

  it('splits in PARTIAL next to labor and prep', () => {
    const configuration = partialBedroom(CATEGORY.floor, PRODUCT.floor);
    const line = lineOf(withAccessories, configuration, CATEGORY.floor);
    expect(line.components?.map((item) => item.kind)).toEqual([
      'MATERIAL',
      'ACCESSORY',
      'LABOR',
      'PREP',
    ]);
    expect(componentsSum(line)).toBe(line.amountCents);
    const plain = lineOf(scopeData, configuration, CATEGORY.floor);
    expect(line.amountCents).toBe(plain.amountCents);
  });

  it('keeps UAH amounts equal', () => {
    const configuration = {
      ...fullBedroom(CATEGORY.floor, PRODUCT.floor),
      currency: 'UAH',
    } as const;
    const split = lineOf(
      { ...withAccessories, exchangeRate },
      configuration,
      CATEGORY.floor,
    );
    const plain = lineOf(
      { ...scopeData, exchangeRate },
      configuration,
      CATEGORY.floor,
    );
    expect(split.amountUahKopecks).not.toBeNull();
    expect(split.amountUahKopecks).toBe(plain.amountUahKopecks);
  });

  it('shows only tile_glue for a floor tile', () => {
    const line = lineOf(
      withAccessories,
      fullBedroom(tileCategory, tileProduct),
      tileCategory,
    );
    expect(line.amountCents).toBe(60000);
    expect(line.components).toEqual([
      { kind: 'MATERIAL', ruleId: tileRule, amountCents: 48000 },
      {
        kind: 'ACCESSORY',
        ruleId: tileRule,
        coefficientKey: 'tile_glue',
        amountCents: 12000,
      },
    ]);
  });

  it('shows only tile_glue_heated on a heated floor', () => {
    const line = lineOf(
      withAccessories,
      fullBedroom(tileCategory, tileProduct, true),
      tileCategory,
    );
    expect(line.amountCents).toBe(64800);
    expect(line.components).toEqual([
      { kind: 'MATERIAL', ruleId: tileRule, amountCents: 48000 },
      {
        kind: 'ACCESSORY',
        ruleId: tileRule,
        coefficientKey: 'tile_glue_heated',
        amountCents: 16800,
      },
    ]);
  });

  it('splits the glue of a wall tile', () => {
    const line = lineOf(
      withAccessories,
      fullBedroom(CATEGORY.wallTile, PRODUCT.wallTile),
      CATEGORY.wallTile,
    );
    expect(line.components?.map((item) => item.kind)).toEqual([
      'MATERIAL',
      'ACCESSORY',
    ]);
    expect(line.components?.[1].coefficientKey).toBe('tile_glue');
    expect(componentsSum(line)).toBe(line.amountCents);
  });

  it('leaves a line without accessories as a single component', () => {
    const line = lineOf(
      withAccessories,
      fullBedroom(CATEGORY.wallPaint, PRODUCT.wallPaint),
      CATEGORY.wallPaint,
    );
    expect(line.components).toHaveLength(1);
    expect(line.components?.[0].kind).toBe('MATERIAL');
  });

  it('is unchanged when the pricing data has no accessories', () => {
    const line = lineOf(
      scopeData,
      fullBedroom(CATEGORY.floor, PRODUCT.floor),
      CATEGORY.floor,
    );
    expect(line.components).toEqual([
      { kind: 'MATERIAL', ruleId: RULE.floor, amountCents: 26400 },
    ]);
  });

  it('ignores accessory keys missing from the coefficients', () => {
    const line = lineOf(
      { ...scopeData, accessories: { unknown_key: underlay } },
      fullBedroom(CATEGORY.floor, PRODUCT.floor),
      CATEGORY.floor,
    );
    expect(line.components).toHaveLength(1);
  });

  it('puts the rounding remainder on the last accessory and drops it when it becomes zero', () => {
    const data = withCostFormula(
      {
        ...scopeData,
        coefficients: {
          ...scopeData.coefficients,
          part_a: 0.006,
          part_b: 0.006,
        },
        accessories: { part_a: underlay, part_b: glue },
      },
      RULE.wallPaint,
      'quantity * price + coef.part_a + coef.part_b',
    );
    const line = lineOf(
      data,
      fullBedroom(CATEGORY.wallPaint, PRODUCT.wallPaint),
      CATEGORY.wallPaint,
    );
    const accessories = line.components?.filter(
      (item) => item.kind === 'ACCESSORY',
    );
    expect(line.amountCents).toBe(35001);
    expect(accessories?.map((item) => item.amountCents)).toEqual([1]);
    expect(accessories?.[0]?.coefficientKey).toBe('part_a');
    expect(componentsSum(line)).toBe(line.amountCents);
    expect(line.components?.every((item) => item.amountCents >= 0)).toBe(true);
  });

  it('falls back to a single component when the formula fails without the accessory', () => {
    const data = withCostFormula(
      { ...scopeData, accessories: { laminate_underlay: underlay } },
      RULE.floor,
      'quantity * price / coef.laminate_underlay',
    );
    const line = lineOf(
      data,
      fullBedroom(CATEGORY.floor, PRODUCT.floor),
      CATEGORY.floor,
    );
    expect(line.status).toBe('OK');
    expect(line.components).toEqual([
      { kind: 'MATERIAL', ruleId: RULE.floor, amountCents: 12000 },
    ]);
  });

  it('falls back to a single component when the accessory lowers the cost', () => {
    const data = withCostFormula(
      { ...scopeData, accessories: { laminate_underlay: underlay } },
      RULE.floor,
      'quantity * price / (coef.laminate_underlay + 1)',
    );
    const line = lineOf(
      data,
      fullBedroom(CATEGORY.floor, PRODUCT.floor),
      CATEGORY.floor,
    );
    expect(line.components).toHaveLength(1);
  });

  it('still fails a formula that references an unknown coefficient', () => {
    const data = withCostFormula(
      { ...scopeData, accessories: { missing: underlay } },
      RULE.floor,
      'quantity * (price + coef.missing)',
    );
    const line = lineOf(
      data,
      fullBedroom(CATEGORY.floor, PRODUCT.floor),
      CATEGORY.floor,
    );
    expect(line.status).toBe('ERROR');
  });
});
