import { describe, expect, it } from 'vitest';
import {
  ConfigurationSchema,
  estimate,
  PricingDataSchema,
  previewRule,
  RulePreviewSchema,
  type RuleSample,
  RuleSampleSchema,
} from '../src';
import { MAX_LINE_CENTS } from '../src/estimate/line';
import reference from './fixtures/reference/us1-reference.json';
import referenceRequest from './fixtures/reference/us1-reference.request.json';

const sample: RuleSample = RuleSampleSchema.parse({
  room: {
    roomTypeCode: 'LIVING_ROOM',
    lengthM: 5,
    widthM: 4,
    heightM: 2.7,
    heatedFloor: false,
  },
  product: { priceCents: 1800, unit: 'SQM', wastePercent: 5 },
  object: {
    scope: 'FULL',
    totalAreaSqm: 62,
    balconyAreaSqm: 4,
    balconyTiles: true,
    finishLevel: 'PRE_FINISH',
    roomsCount: 1,
    bathroomsCount: 1,
    roomsFloorArea: 50,
    roomsWallArea: 135,
    roomsPerimeter: 50,
    wetRoomsCount: 2,
  },
});

const floorRule = {
  level: 'CATEGORY',
  quantityFormula: 'floorArea * (1 + waste)',
  costFormula: 'quantity * (price + coef.underlay)',
  coefficients: { underlay: 2 },
  sample,
} as const;

describe('previewRule', () => {
  it('previews a material rule with the values it used', () => {
    const preview = previewRule(floorRule);
    expect(preview).toEqual({
      quantity: 21,
      amountCents: 42000,
      laborCents: null,
      variables: { floorArea: 20, waste: 0.05, price: 18, quantity: 21 },
      coefficients: { underlay: 2 },
      error: null,
    });
    expect(RulePreviewSchema.parse(preview)).toEqual(preview);
  });

  it('lists only the variables and coefficients the formulas reference', () => {
    const preview = previewRule({
      ...floorRule,
      quantityFormula: 'max(wallArea, 1)',
      costFormula: 'quantity * (1 - -coef.a) + (!balconyTiles ? coef.b : 0)',
      coefficients: { a: 1, b: 2, unused: 3 },
    });
    expect(Object.keys(preview.variables).sort()).toEqual([
      'balconyTiles',
      'quantity',
      'wallArea',
    ]);
    expect(preview.coefficients).toEqual({ a: 1, b: 2 });
  });

  it('previews an object rule without a quantity', () => {
    expect(
      previewRule({
        level: 'OBJECT',
        quantityFormula: null,
        costFormula: 'balconyTiles ? balconyArea * coef.balcony_tile : 0',
        coefficients: { balcony_tile: 75 },
        sample: { object: sample.object },
      }),
    ).toEqual({
      quantity: null,
      amountCents: 30000,
      laborCents: null,
      variables: { balconyTiles: true, balconyArea: 4 },
      coefficients: { balcony_tile: 75 },
      error: null,
    });
  });

  it('reports an unknown coefficient and omits it from the result', () => {
    const preview = previewRule({
      ...floorRule,
      costFormula: 'quantity * coef.missing',
    });
    expect(preview.error?.code).toBe('UNKNOWN_COEFFICIENT');
    expect(preview.amountCents).toBeNull();
    expect(preview.coefficients).toEqual({});
  });

  it('reports a runtime error of the quantity formula without a quantity', () => {
    const preview = previewRule({ ...floorRule, quantityFormula: '1 / 0' });
    expect(preview).toMatchObject({
      quantity: null,
      amountCents: null,
      error: {
        code: 'FORMULA_RUNTIME_ERROR',
        params: { reason: 'DIVISION_BY_ZERO' },
      },
    });
  });

  it('keeps the quantity when the cost formula fails', () => {
    const preview = previewRule({ ...floorRule, costFormula: 'quantity / 0' });
    expect(preview.quantity).toBe(21);
    expect(preview.amountCents).toBeNull();
    expect(preview.error?.code).toBe('FORMULA_RUNTIME_ERROR');
  });

  it('reports a syntax error without referencing anything from it', () => {
    const preview = previewRule({
      ...floorRule,
      quantityFormula: 'floorArea *',
    });
    expect(preview.error?.code).toBe('FORMULA_SYNTAX');
    expect(Object.keys(preview.variables)).toEqual(['price']);
  });

  it('reports an amount beyond the line limit', () => {
    const preview = previewRule({
      ...floorRule,
      costFormula: `quantity * ${MAX_LINE_CENTS}`,
    });
    expect(preview).toMatchObject({
      quantity: 21,
      amountCents: null,
      error: {
        code: 'AMOUNT_OUT_OF_RANGE',
        params: { maxCents: MAX_LINE_CENTS },
      },
    });
  });

  it('exposes the new object variables to the formulas', () => {
    const preview = previewRule({
      level: 'OBJECT',
      quantityFormula: null,
      costFormula:
        "scope == 'FULL' ? roomsFloorArea + roomsWallArea + roomsPerimeter + wetRoomsCount : 0",
      coefficients: {},
      sample,
    });
    expect(preview.error).toBeNull();
    expect(preview.amountCents).toBe(23700);
    expect(preview.variables).toEqual({
      scope: 'FULL',
      roomsFloorArea: 50,
      roomsWallArea: 135,
      roomsPerimeter: 50,
      wetRoomsCount: 2,
    });
  });

  it('previews roomsPuttyWallArea as the wall area by default and from the sample', () => {
    const preview = (roomsPuttyWallArea?: number) =>
      previewRule({
        level: 'OBJECT',
        quantityFormula: null,
        costFormula: 'roomsPuttyWallArea',
        coefficients: {},
        sample: {
          ...sample,
          object: { ...sample.object, roomsPuttyWallArea },
        },
      });
    expect(preview().amountCents).toBe(13500);
    expect(preview(40).amountCents).toBe(4000);
  });

  it('previews a surface rule with the surface area and no quantity', () => {
    const preview = previewRule({
      level: 'SURFACE',
      quantityFormula: null,
      costFormula: 'surfaceArea * coef.rate + floorArea',
      coefficients: { rate: 2 },
      sample: { ...sample, surfaceArea: 10 },
    });
    expect(preview.error).toBeNull();
    expect(preview.amountCents).toBe(4000);
    expect(preview.variables).toEqual({ surfaceArea: 10, floorArea: 20 });
  });

  it('previews puttyArea as the surface area by default and from the sample', () => {
    const preview = (puttyArea?: number) =>
      previewRule({
        level: 'SURFACE',
        quantityFormula: null,
        costFormula: 'puttyArea',
        coefficients: {},
        sample: { ...sample, surfaceArea: 10, puttyArea },
      });
    expect(preview().amountCents).toBe(1000);
    expect(preview(4).amountCents).toBe(400);
  });

  it('previews puttyRequired as true by default and from the sample', () => {
    const rule = {
      level: 'SURFACE',
      quantityFormula: null,
      costFormula: 'puttyRequired ? surfaceArea : 0',
      coefficients: {},
    } as const;
    const preview = (puttyRequired?: boolean) =>
      previewRule({
        ...rule,
        sample: { ...sample, surfaceArea: 10, puttyRequired },
      });
    expect(preview().amountCents).toBe(1000);
    expect(preview().variables).toEqual({
      puttyRequired: true,
      surfaceArea: 10,
    });
    expect(preview(false).amountCents).toBe(0);
  });

  it('reports an incomplete surface sample', () => {
    const rule = {
      level: 'SURFACE',
      quantityFormula: null,
      costFormula: 'surfaceArea',
      coefficients: {},
    } as const;
    expect(previewRule({ ...rule, sample }).error).toEqual({
      code: 'SAMPLE_INCOMPLETE',
      params: { missing: 'surfaceArea' },
    });
    expect(
      previewRule({
        ...rule,
        sample: { ...sample, surfaceArea: 1, room: undefined },
      }).error,
    ).toEqual({ code: 'SAMPLE_INCOMPLETE', params: { missing: 'room' } });
    expect(
      previewRule({
        ...rule,
        quantityFormula: 'surfaceArea',
        sample: { ...sample, surfaceArea: 1 },
      }).error,
    ).toEqual({ code: 'QUANTITY_FORMULA_MISMATCH' });
  });

  it('reports an incomplete sample', () => {
    expect(
      previewRule({ ...floorRule, sample: { ...sample, room: undefined } })
        .error,
    ).toEqual({ code: 'SAMPLE_INCOMPLETE', params: { missing: 'room' } });
    expect(
      previewRule({
        ...floorRule,
        level: 'MATERIAL_TYPE',
        sample: { ...sample, product: undefined },
      }).error,
    ).toEqual({ code: 'SAMPLE_INCOMPLETE', params: { missing: 'product' } });
  });

  it('rejects a quantity formula that does not match the level', () => {
    const mismatch = { code: 'QUANTITY_FORMULA_MISMATCH' };
    expect(previewRule({ ...floorRule, level: 'OBJECT' }).error).toEqual(
      mismatch,
    );
    expect(previewRule({ ...floorRule, quantityFormula: null }).error).toEqual(
      mismatch,
    );
  });

  it('matches the lines of estimate for the same input', () => {
    const data = PricingDataSchema.parse(reference.pricingData);
    const result = estimate(ConfigurationSchema.parse(referenceRequest), data);
    const rule = (id: string) => {
      const found = data.rules.find((item) => item.id === id);
      if (found === undefined) {
        throw new Error(id);
      }
      return found;
    };
    const floor = rule('rule-floor');
    const material = previewRule({
      level: floor.level,
      quantityFormula: floor.quantityFormula,
      costFormula: floor.costFormula,
      coefficients: data.coefficients,
      sample,
    });
    const line = result.lines.find(
      (item) => item.id === 'MATERIALS:living:cat-floor',
    );
    expect(material.quantity).toBe(line?.quantity);
    expect(material.amountCents).toBe(line?.amountCents);

    const balcony = rule('rule-balcony-tile');
    const object = previewRule({
      level: balcony.level,
      quantityFormula: balcony.quantityFormula,
      costFormula: balcony.costFormula,
      coefficients: data.coefficients,
      sample: { object: sample.object },
    });
    expect(object.amountCents).toBe(
      result.lines.find((item) => item.id === 'OBJECT:rule-balcony-tile')
        ?.amountCents,
    );
  });
});

describe('previewRule in a partial renovation', () => {
  const partialSample = RuleSampleSchema.parse({
    ...sample,
    object: { ...sample.object, scope: 'PARTIAL', totalAreaSqm: null },
  });

  it('uses the rooms floor area as totalArea', () => {
    const preview = previewRule({
      level: 'OBJECT',
      quantityFormula: null,
      costFormula: 'totalArea * 2',
      coefficients: {},
      sample: { object: partialSample.object },
    });
    expect(preview.amountCents).toBe(10000);
    expect(preview.variables).toEqual({ totalArea: 50 });
  });

  it('keeps totalAreaSqm as totalArea in a full renovation', () => {
    const preview = previewRule({
      level: 'OBJECT',
      quantityFormula: null,
      costFormula: 'totalArea',
      coefficients: {},
      sample: { object: sample.object },
    });
    expect(preview.variables).toEqual({ totalArea: 62 });
  });

  it('requires totalAreaSqm in FULL and rejects it in PARTIAL', () => {
    expect(
      RuleSampleSchema.safeParse({
        ...sample,
        object: { ...sample.object, totalAreaSqm: null },
      }).success,
    ).toBe(false);
    expect(
      RuleSampleSchema.safeParse({
        ...sample,
        object: { ...sample.object, scope: 'PARTIAL' },
      }).success,
    ).toBe(false);
  });
});

describe('previewRule labor formula', () => {
  const withLabor = { ...floorRule, laborFormula: 'quantity * coef.labor' };
  const coefficients = { underlay: 2, labor: 4 };

  it('previews the labor cost next to the material cost', () => {
    const preview = previewRule({ ...withLabor, coefficients });
    expect(preview).toEqual({
      quantity: 21,
      amountCents: 42000,
      laborCents: 8400,
      variables: { floorArea: 20, waste: 0.05, price: 18, quantity: 21 },
      coefficients,
      error: null,
    });
    expect(RulePreviewSchema.parse(preview)).toEqual(preview);
  });

  it('has no labor result without a labor formula', () => {
    expect(previewRule(floorRule).laborCents).toBeNull();
    expect(
      previewRule({ ...floorRule, laborFormula: null }).laborCents,
    ).toBeNull();
  });

  it('references the labor formula variables and coefficients', () => {
    const preview = previewRule({
      ...floorRule,
      laborFormula: 'wallArea * coef.labor',
      coefficients,
    });
    expect(preview.variables).toHaveProperty('wallArea');
    expect(preview.coefficients).toEqual({ underlay: 2, labor: 4 });
  });

  it('reports a labor error and keeps the material cost', () => {
    const preview = previewRule({
      ...withLabor,
      laborFormula: 'quantity * coef.missing',
      coefficients,
    });
    expect(preview).toMatchObject({
      amountCents: 42000,
      laborCents: null,
      error: { code: 'UNKNOWN_COEFFICIENT' },
    });
  });

  it('reports a labor amount beyond the line limit', () => {
    const preview = previewRule({
      ...withLabor,
      laborFormula: `quantity * ${MAX_LINE_CENTS}`,
      coefficients,
    });
    expect(preview).toMatchObject({
      amountCents: 42000,
      laborCents: null,
      error: { code: 'AMOUNT_OUT_OF_RANGE' },
    });
  });

  it('ignores a labor formula on object rules', () => {
    const preview = previewRule({
      level: 'OBJECT',
      quantityFormula: null,
      costFormula: 'balconyArea',
      laborFormula: 'balconyArea',
      coefficients: {},
      sample: { object: sample.object },
    });
    expect(preview.laborCents).toBeNull();
  });
});
