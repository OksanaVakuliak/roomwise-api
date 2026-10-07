import { describe, expect, it } from 'vitest';
import type { EvaluationScope, FormulaNode } from '../src/formula';
import { evaluate, parse } from '../src/formula';

const scope: EvaluationScope = {
  variables: {
    length: 5,
    width: 4,
    price: 18,
    huge: 1e308,
    heatedFloor: true,
    roomType: 'BATHROOM',
    kitchenType: 'ISLAND',
  },
  coefficients: { markup: 1.2, zero: 0 },
};

function run(source: string, using: EvaluationScope = scope) {
  const parsed = parse(source);
  if (!parsed.ok) {
    throw new Error(`${source}: ${parsed.error.code}`);
  }
  return evaluate(parsed.ast, using);
}

function value(source: string) {
  const result = run(source);
  if (!result.ok) {
    throw new Error(`${source}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function error(source: string) {
  const result = run(source);
  if (result.ok) {
    throw new Error(`${source} evaluated to ${String(result.value)}`);
  }
  return result.error;
}

function runtime(reason: string) {
  return { code: 'FORMULA_RUNTIME_ERROR', params: { reason } };
}

describe('evaluate arithmetic', () => {
  it('respects precedence and grouping', () => {
    expect(value('1 + 2 * 3')).toBe(7);
    expect(value('(1 + 2) * 3')).toBe(9);
    expect(value('10 - 4 - 3')).toBe(3);
    expect(value('length * width / 2')).toBe(10);
    expect(value('-length + 1')).toBe(-4);
  });

  it('is deterministic for decimal results', () => {
    expect(value('0.1 + 0.2')).toBe(0.1 + 0.2);
  });

  it('reads coefficients', () => {
    expect(value('price * coef.markup')).toBeCloseTo(21.6);
  });
});

describe('evaluate functions', () => {
  it('supports min and max with any number of arguments', () => {
    expect(value('min(3, 1, 2)')).toBe(1);
    expect(value('max(3, 1, 2)')).toBe(3);
    expect(value('max(length)')).toBe(5);
  });

  it('supports round, ceil and floor', () => {
    expect(value('round(2.5)')).toBe(3);
    expect(value('ceil(2.1)')).toBe(3);
    expect(value('floor(2.9)')).toBe(2);
  });

  it('rejects wrong argument counts', () => {
    expect(error('min()')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('round(1, 2)')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('floor()')).toMatchObject(runtime('TYPE_MISMATCH'));
  });

  it('rejects non-numeric arguments', () => {
    expect(error('round(heatedFloor)')).toMatchObject(runtime('TYPE_MISMATCH'));
  });
});

describe('evaluate logic', () => {
  it('evaluates comparisons', () => {
    expect(value('length > width')).toBe(true);
    expect(value('length < width')).toBe(false);
    expect(value('length >= 5')).toBe(true);
    expect(value('length <= 4')).toBe(false);
  });

  it('evaluates booleans with short circuit', () => {
    expect(value('heatedFloor && length > 1')).toBe(true);
    expect(value('!heatedFloor || length > 1')).toBe(true);
    expect(value('!heatedFloor && 1 / 0 > 1')).toBe(false);
    expect(value('heatedFloor || 1 / 0 > 1')).toBe(true);
    expect(value('heatedFloor && !heatedFloor')).toBe(false);
  });

  it('evaluates equality of same-typed values', () => {
    expect(value('length == 5')).toBe(true);
    expect(value('length != 5')).toBe(false);
    expect(value('heatedFloor == true')).toBe(true);
    expect(value('roomType != kitchenType')).toBe(true);
    expect(value('roomType == roomType')).toBe(true);
  });

  it('evaluates ternaries lazily', () => {
    expect(value('heatedFloor ? price : 0')).toBe(18);
    expect(value('!heatedFloor ? 1 / 0 : 2')).toBe(2);
    expect(value('length > 100 ? 1 : length > 4 ? 2 : 3')).toBe(2);
  });
});

describe('evaluate enum comparison', () => {
  it('compares enum variables with string literals', () => {
    expect(value('roomType == "BATHROOM"')).toBe(true);
    expect(value('roomType == "KITCHEN"')).toBe(false);
    expect(value('roomType != "KITCHEN"')).toBe(true);
    expect(value('roomType != "BATHROOM"')).toBe(false);
    expect(value('"BATHROOM" == roomType')).toBe(true);
    expect(value('roomType == "BATHROOM" ? 2 : 1')).toBe(2);
  });

  it('rejects string literals anywhere else', () => {
    expect(error('"BATHROOM"')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('"a" == "a"')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('length == "5"')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('(1 + 2) == "3"')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('"a" + 1')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('max("a")')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('"a" < roomType')).toMatchObject(runtime('TYPE_MISMATCH'));
  });

  it('reports unknown variables beside a string literal', () => {
    expect(error('floorType == "TILE"')).toMatchObject({
      code: 'UNKNOWN_VARIABLE',
      params: { name: 'floorType' },
    });
  });
});

describe('evaluate type errors', () => {
  it('rejects arithmetic on non-numbers', () => {
    expect(error('heatedFloor + 1')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('1 * roomType')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('-heatedFloor')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('heatedFloor < 1')).toMatchObject(runtime('TYPE_MISMATCH'));
  });

  it('rejects logic on non-booleans', () => {
    expect(error('length && true')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('true && length')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('false || length')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('!length')).toMatchObject(runtime('TYPE_MISMATCH'));
  });

  it('rejects mixed-type equality', () => {
    expect(error('length == true')).toMatchObject(runtime('TYPE_MISMATCH'));
    expect(error('heatedFloor != 1')).toMatchObject(runtime('TYPE_MISMATCH'));
  });

  it('rejects non-boolean ternary tests', () => {
    expect(error('length ? 1 : 2')).toMatchObject(runtime('TYPE_MISMATCH'));
  });

  it('reports the offending span', () => {
    expect(error('1 + true')).toMatchObject({ position: 4, length: 4 });
  });
});

describe('evaluate numeric failures', () => {
  it('rejects division by zero', () => {
    expect(error('1 / 0')).toMatchObject(runtime('DIVISION_BY_ZERO'));
    expect(error('length / (width - 4)')).toMatchObject(
      runtime('DIVISION_BY_ZERO'),
    );
    expect(error('1 / coef.zero')).toMatchObject(runtime('DIVISION_BY_ZERO'));
  });

  it('rejects non-finite results', () => {
    expect(error('huge * 10')).toMatchObject(runtime('NOT_FINITE'));
    expect(error('huge + huge')).toMatchObject(runtime('NOT_FINITE'));
    expect(error('-huge - huge')).toMatchObject(runtime('NOT_FINITE'));
    expect(error('huge / 0.001')).toMatchObject(runtime('NOT_FINITE'));
  });

  it('rejects non-finite function results and negations', () => {
    const infinite: EvaluationScope = {
      variables: { inf: Number.POSITIVE_INFINITY },
      coefficients: {},
    };
    expect(run('-inf', infinite)).toMatchObject({
      ok: false,
      error: runtime('NOT_FINITE'),
    });
    expect(run('max(inf)', infinite)).toMatchObject({
      ok: false,
      error: runtime('NOT_FINITE'),
    });
  });

  it('allows negative results', () => {
    expect(value('width - length')).toBe(-1);
  });
});

describe('evaluate unknown names', () => {
  it('rejects unknown variables with the name', () => {
    expect(error('foo + 1')).toMatchObject({
      code: 'UNKNOWN_VARIABLE',
      params: { name: 'foo' },
      position: 0,
      length: 3,
    });
  });

  it('rejects unknown coefficients with the key', () => {
    expect(error('coef.missing')).toMatchObject({
      code: 'UNKNOWN_COEFFICIENT',
      params: { key: 'missing' },
    });
  });

  it('rejects member access outside coef', () => {
    expect(error('length.value')).toMatchObject({ code: 'UNKNOWN_VARIABLE' });
    expect(error('(1 + 2).x')).toMatchObject({ code: 'UNKNOWN_VARIABLE' });
    expect(error('coef.markup.x')).toMatchObject({ code: 'UNKNOWN_VARIABLE' });
  });

  it('rejects the bare coef namespace', () => {
    expect(error('coef')).toMatchObject({ code: 'UNKNOWN_VARIABLE' });
  });
});

describe('evaluate security', () => {
  const inherited = [
    'constructor',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'prototype',
  ];

  it.each(inherited)('rejects variable %s', (name) => {
    expect(error(name)).toMatchObject({
      code: 'UNKNOWN_VARIABLE',
      params: { name },
    });
  });

  it.each(inherited)('rejects coefficient coef.%s', (name) => {
    expect(error(`coef.${name}`)).toMatchObject({
      code: 'UNKNOWN_COEFFICIENT',
      params: { key: name },
    });
  });

  it.each(inherited)('rejects calling %s as a function', (name) => {
    expect(error(`${name}()`)).toMatchObject({ code: 'UNKNOWN_FUNCTION' });
  });

  it('rejects chained constructor access', () => {
    expect(error('constructor.constructor("x")()')).toMatchObject({
      code: 'UNKNOWN_FUNCTION',
    });
    expect(error('length.constructor')).toMatchObject({
      code: 'UNKNOWN_VARIABLE',
    });
    expect(error('coef.markup.constructor')).toMatchObject({
      code: 'UNKNOWN_VARIABLE',
    });
  });

  it.each([
    'eval("1")',
    'Function("return 1")()',
    'Math.max(1, 2)',
    'Math.pow(2, 3)',
    'pow(2, 3)',
    'sqrt(4)',
    'abs(1)',
    'process.exit()',
    'globalThis.x()',
    'length()',
    'roomType()',
    'coef.markup()',
    'min(1)(2)',
  ])('rejects %s', (source) => {
    expect(run(source).ok).toBe(false);
  });

  it('does not run anything for rejected calls', () => {
    const trap = {
      get danger(): never {
        throw new Error('executed');
      },
    };
    const guarded: EvaluationScope = {
      variables: { trap },
      coefficients: {},
    };
    expect(run('trap.danger', guarded).ok).toBe(false);
    expect(run('trap.danger()', guarded).ok).toBe(false);
  });

  it('ignores inherited properties of the scope objects', () => {
    const variables = Object.create({ polluted: 1 }) as object;
    const coefficients = Object.create({ polluted: 1 }) as Record<
      string,
      number
    >;
    const inheriting: EvaluationScope = { variables, coefficients };
    expect(run('polluted', inheriting).ok).toBe(false);
    expect(run('coef.polluted', inheriting).ok).toBe(false);
  });

  it('rejects unknown node types instead of falling through', () => {
    const forged = { type: 'Sequence', start: 0, end: 3 } as unknown;
    expect(evaluate(forged as FormulaNode, scope)).toMatchObject({
      ok: false,
      error: runtime('TYPE_MISMATCH'),
    });
  });
});

describe('evaluate unexpected errors', () => {
  it('rethrows errors that are not formula failures', () => {
    const throwing: EvaluationScope = {
      variables: new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw new Error('boom');
          },
        },
      ),
      coefficients: {},
    };
    expect(() => run('x', throwing)).toThrow('boom');
  });
});
