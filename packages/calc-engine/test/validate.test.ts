import { describe, expect, it } from 'vitest';
import type { Configuration, PricingCategory, PricingProduct } from '../src';
import {
  FORMULA_FUNCTIONS,
  FORMULA_LIMITS,
  FORMULA_QUANTITY_VARIABLE,
  FORMULA_SCOPE_VARIABLES,
  FORMULA_VARIABLES,
  levenshtein,
  objectVariables,
  productVariables,
  roomVariables,
  suggestNearest,
  validateFormula,
} from '../src';

const coefficientKeys = ['waste_factor', 'labor'];

function check(
  source: string,
  level: 'OBJECT' | 'CATEGORY' | 'MATERIAL_TYPE' = 'CATEGORY',
  kind: 'quantity' | 'cost' = 'cost',
) {
  return validateFormula({ level, kind, source, coefficientKeys });
}

describe('levenshtein and suggestNearest', () => {
  it('computes edit distance', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('florArea', 'floorArea')).toBe(1);
  });

  it('returns the nearest candidate within the limit', () => {
    expect(suggestNearest('florArea', ['width', 'floorArea'])).toBe(
      'floorArea',
    );
  });

  it('returns nothing when every candidate is too far', () => {
    expect(suggestNearest('zzzzzz', ['width', 'floorArea'])).toBeUndefined();
    expect(suggestNearest('abc', [])).toBeUndefined();
  });

  it('respects a custom limit', () => {
    expect(suggestNearest('abcd', ['abxy'], 1)).toBeUndefined();
    expect(suggestNearest('abcd', ['abxy'], 2)).toBe('abxy');
  });

  it('prefers the smaller distance, then alphabetical order', () => {
    expect(suggestNearest('ab', ['abcd', 'abc'])).toBe('abc');
    expect(suggestNearest('ab', ['bb', 'ac'])).toBe('ac');
    expect(suggestNearest('ab', ['ac', 'bb'])).toBe('ac');
  });
});

describe('validateFormula valid formulas', () => {
  it('accepts room, product and object variables at category level', () => {
    const result = check(
      'floorArea * price * (1 + waste) + totalArea * coef.labor',
    );
    expect(result).toEqual({
      valid: true,
      coefficientKeys: ['labor'],
      errors: [],
    });
  });

  it('accepts quantity in the cost formula of material type rules', () => {
    expect(check('quantity * price', 'MATERIAL_TYPE', 'cost').valid).toBe(true);
  });

  it('accepts object variables, coefficients and functions at object level', () => {
    const result = check(
      'max(totalArea, 40) * coef.labor + (gas ? 100 : 0)',
      'OBJECT',
    );
    expect(result.valid).toBe(true);
    expect(result.coefficientKeys).toEqual(['labor']);
  });

  it('accepts string comparison with enum variables', () => {
    expect(
      check('roomType == "BATHROOM" ? floorArea : 0', 'CATEGORY', 'quantity')
        .valid,
    ).toBe(true);
  });

  it('accepts every allowed function', () => {
    for (const name of FORMULA_FUNCTIONS) {
      expect(check(`${name}(floorArea, 2)`, 'CATEGORY', 'quantity').valid).toBe(
        true,
      );
    }
  });

  it('returns used coefficient keys unique and in order of appearance', () => {
    const result = check('coef.labor + coef.waste_factor + coef.labor');
    expect(result.coefficientKeys).toEqual(['labor', 'waste_factor']);
  });
});

describe('validateFormula errors', () => {
  it('returns the parse error as is', () => {
    expect(check('1 +')).toMatchObject({
      valid: false,
      coefficientKeys: [],
      errors: [{ code: 'FORMULA_SYNTAX' }],
    });
  });

  it('reports formulas over the complexity limit', () => {
    const result = check('1'.repeat(FORMULA_LIMITS.maxLength + 1));
    expect(result.errors.map((error) => error.code)).toEqual([
      'FORMULA_TOO_COMPLEX',
    ]);
  });

  it('reports an unknown variable with a suggestion', () => {
    const result = check('1 + florArea');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      {
        code: 'UNKNOWN_VARIABLE',
        position: 4,
        length: 8,
        params: { name: 'florArea', suggestion: 'floorArea' },
      },
    ]);
  });

  it('gives no suggestion when nothing is near', () => {
    const [error] = check('banana').errors;
    expect(error).toEqual({
      code: 'UNKNOWN_VARIABLE',
      position: 0,
      length: 6,
      params: { name: 'banana' },
    });
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'treats %s as an unknown variable',
    (name) => {
      const [error] = check(`1 + ${name}`).errors;
      expect(error).toMatchObject({
        code: 'UNKNOWN_VARIABLE',
        position: 4,
        length: name.length,
      });
    },
  );

  it('reports an unknown coefficient on the whole member', () => {
    expect(check('2 * coef.missing').errors).toEqual([
      {
        code: 'UNKNOWN_COEFFICIENT',
        position: 4,
        length: 12,
        params: { key: 'missing' },
      },
    ]);
  });

  it('still lists the keys of unknown coefficients that were used', () => {
    expect(check('coef.missing').coefficientKeys).toEqual(['missing']);
  });

  it('reports room and product variables at object level', () => {
    const result = check('totalArea + floorArea * price', 'OBJECT');
    expect(result.errors).toEqual([
      {
        code: 'VARIABLE_NOT_ALLOWED_AT_LEVEL',
        position: 12,
        length: 9,
        params: { variable: 'floorArea', level: 'OBJECT' },
      },
      {
        code: 'VARIABLE_NOT_ALLOWED_AT_LEVEL',
        position: 24,
        length: 5,
        params: { variable: 'price', level: 'OBJECT' },
      },
    ]);
  });

  it('reports quantity in the quantity formula', () => {
    expect(check('quantity * 2', 'CATEGORY', 'quantity').errors).toEqual([
      { code: 'QUANTITY_NOT_ALLOWED', position: 0, length: 8 },
    ]);
  });

  it('reports quantity at object level', () => {
    expect(check('1 + quantity', 'OBJECT').errors).toEqual([
      { code: 'QUANTITY_NOT_ALLOWED', position: 4, length: 8 },
    ]);
  });

  it('reports an unknown function on the callee', () => {
    expect(check('sqrt(floorArea)').errors).toEqual([
      {
        code: 'UNKNOWN_FUNCTION',
        position: 0,
        length: 4,
        params: { name: 'sqrt' },
      },
    ]);
  });

  it('reports a callee that is not a plain identifier', () => {
    expect(check('coef.labor(2)').errors).toEqual([
      {
        code: 'UNKNOWN_FUNCTION',
        position: 0,
        length: 10,
        params: { name: 'coef.labor' },
      },
    ]);
    expect(check('(1)(2)').errors).toMatchObject([
      { code: 'UNKNOWN_FUNCTION' },
    ]);
  });

  it('validates arguments of an unknown function', () => {
    expect(check('sqrt(florArea)').errors.map((error) => error.code)).toEqual([
      'UNKNOWN_FUNCTION',
      'UNKNOWN_VARIABLE',
    ]);
  });

  it('reports member access other than coef', () => {
    expect(check('floorArea.x').errors).toEqual([
      {
        code: 'UNKNOWN_VARIABLE',
        position: 0,
        length: 11,
        params: { name: 'floorArea.x' },
      },
    ]);
  });

  it('collects all errors in source order across nested nodes', () => {
    const result = check('!a ? -b : c * d < 1 ? coef.x : max(e)');
    expect(result.errors.map((error) => error.position)).toEqual([
      1, 6, 10, 14, 22, 35,
    ]);
  });
});

describe('formula constants stay in sync with variable derivation', () => {
  const configuration = {
    totalAreaSqm: 60,
    balconyAreaSqm: 4,
    balconyTiles: true,
    gas: true,
    kitchenType: 'SEPARATE',
    finishLevel: 'ROUGH',
    rooms: [
      {
        clientId: 'a',
        roomTypeCode: 'BATHROOM',
        lengthM: 3,
        widthM: 2,
        heightM: 2.5,
        heatedFloor: false,
      },
    ],
  } as unknown as Configuration;
  const product = { priceCents: 1000, unit: 'SQM' } as PricingProduct;
  const category = { wastePercent: 5 } as PricingCategory;

  const names = (scope: keyof typeof FORMULA_SCOPE_VARIABLES) =>
    FORMULA_SCOPE_VARIABLES[scope].map((variable) => variable.name).sort();

  it('matches room variables', () => {
    const room = configuration.rooms[0] as Configuration['rooms'][number];
    expect(names('room')).toEqual(Object.keys(roomVariables(room)).sort());
  });

  it('matches product variables', () => {
    expect(names('product')).toEqual(
      Object.keys(productVariables(product, category)).sort(),
    );
  });

  it('matches object variables', () => {
    expect(names('object')).toEqual(
      Object.keys(objectVariables(configuration)).sort(),
    );
  });

  it('gives object level only object variables', () => {
    expect(FORMULA_VARIABLES.OBJECT).toEqual(FORMULA_SCOPE_VARIABLES.object);
    expect(FORMULA_VARIABLES.CATEGORY).toEqual(FORMULA_VARIABLES.MATERIAL_TYPE);
    expect(FORMULA_VARIABLES.CATEGORY.map((v) => v.name)).not.toContain(
      FORMULA_QUANTITY_VARIABLE.name,
    );
  });
});
