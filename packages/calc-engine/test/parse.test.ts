import { describe, expect, it } from 'vitest';
import type { FormulaNode } from '../src/formula';
import { FORMULA_LIMITS, parse } from '../src/formula';

function ast(source: string): FormulaNode {
  const result = parse(source);
  if (!result.ok) {
    throw new Error(
      `${source}: ${result.error.code} at ${result.error.position}`,
    );
  }
  return result.ast;
}

function failure(source: string) {
  const result = parse(source);
  if (result.ok) {
    throw new Error(`${source} parsed`);
  }
  return result.error;
}

describe('parse valid formulas', () => {
  it('parses arithmetic with grouping and precedence', () => {
    const node = ast('floorArea * price * (1 + waste)');
    expect(node).toMatchObject({
      type: 'Binary',
      operator: '*',
      start: 0,
      end: 31,
      left: { type: 'Binary', operator: '*' },
      right: {
        type: 'Binary',
        operator: '+',
        left: { type: 'Literal', value: 1 },
        right: { type: 'Identifier', name: 'waste', start: 25, end: 30 },
      },
    });
  });

  it('parses the ternary operator', () => {
    expect(ast('heatedFloor ? floorArea * 2 : 0')).toMatchObject({
      type: 'Conditional',
      test: { type: 'Identifier', name: 'heatedFloor' },
      consequent: { type: 'Binary', operator: '*' },
      alternate: { type: 'Literal', value: 0 },
    });
  });

  it('parses nested ternaries as right associative', () => {
    expect(ast('a ? 1 : b ? 2 : 3')).toMatchObject({
      type: 'Conditional',
      alternate: { type: 'Conditional' },
    });
  });

  it('parses coefficient access', () => {
    expect(ast('coef.markup')).toMatchObject({
      type: 'Member',
      object: { type: 'Identifier', name: 'coef', start: 0, end: 4 },
      property: { type: 'Identifier', name: 'markup', start: 5, end: 11 },
      start: 0,
      end: 11,
    });
  });

  it('parses function calls', () => {
    expect(ast('min(a, b)')).toMatchObject({
      type: 'Call',
      callee: { type: 'Identifier', name: 'min', start: 0, end: 3 },
      args: [
        { type: 'Identifier', name: 'a', start: 4, end: 5 },
        { type: 'Identifier', name: 'b', start: 7, end: 8 },
      ],
    });
  });

  it('parses comparisons, logic, unary minus, strings and booleans', () => {
    expect(
      ast('roomType == "BATHROOM" && !heatedFloor || -x <= 1.5'),
    ).toMatchObject({
      type: 'Binary',
      operator: '||',
    });
    expect(ast('gas == true')).toMatchObject({
      type: 'Binary',
      right: { type: 'Literal', value: true },
    });
  });

  it('does not count parentheses in spans', () => {
    expect(ast('((a))')).toMatchObject({
      type: 'Identifier',
      start: 2,
      end: 3,
    });
  });

  it('is repeatable', () => {
    expect(parse('a + b')).toEqual(parse('a + b'));
  });
});

describe('parse syntax errors', () => {
  it.each([
    ['floorArea * ', 12, 0],
    ['a + (b', 6, 0],
    ['a ++ b', 3, 1],
    ['1 +', 3, 0],
    ['a ? b', 5, 0],
    ['a ? b :', 7, 0],
    [')', 0, 1],
    ['a )', 2, 1],
    ['1.2.3', 3, 1],
    ['f(a,)', 5, 0],
    ['"abc', 4, 0],
    ['x = 1', 2, 1],
    ['a; b', 1, 1],
    ['a;', 1, 1],
    ['a b', 2, 1],
    ['a, b', 3, 1],
    ['(a, b)', 4, 1],
    ['new Foo()', 4, 5],
  ])('reports %j at %i with length %i', (source, position, length) => {
    expect(failure(source)).toMatchObject({
      code: 'FORMULA_SYNTAX',
      position,
      length,
    });
  });

  it('reports empty formulas', () => {
    expect(failure('')).toMatchObject({
      code: 'FORMULA_SYNTAX',
      position: 0,
      length: 0,
    });
    expect(failure('   ')).toMatchObject({
      code: 'FORMULA_SYNTAX',
      position: 0,
      length: 3,
    });
  });

  it('carries a detail param', () => {
    expect(failure('a + (b').params).toEqual({ detail: 'Unclosed (' });
  });
});

describe('parse removed and unsupported syntax', () => {
  it.each([
    ['a ** b', 3],
    ['a | b', 2],
    ['a ^ b', 2],
    ['a & b', 2],
    ['a << b', 3],
    ['a >> b', 3],
    ['a >>> b', 3],
    ['~a', 0],
    ['a % b', 2],
    ['a === b', 4],
    ['a !== b', 4],
    ['a in b', 2],
    ['a instanceof b', 2],
  ])('rejects %j', (source, position) => {
    expect(failure(source)).toMatchObject({ code: 'FORMULA_SYNTAX', position });
  });

  it.each([
    ['this', 0, 4],
    ['[1, 2]', 0, 6],
    ['a[0]', 0, 4],
    ['a?.b', 0, 4],
  ])('rejects %j', (source, position, length) => {
    expect(failure(source)).toMatchObject({
      code: 'FORMULA_SYNTAX',
      position,
      length,
    });
  });

  it('leaves null and other words to the validator as identifiers', () => {
    expect(ast('null')).toMatchObject({ type: 'Identifier', name: 'null' });
  });
});

describe('parse limits', () => {
  it('accepts exactly 500 characters', () => {
    const source = `a${' '.repeat(FORMULA_LIMITS.maxLength - 1)}`;
    expect(parse(source).ok).toBe(true);
  });

  it('rejects 501 characters', () => {
    const source = `a${' '.repeat(FORMULA_LIMITS.maxLength)}`;
    expect(failure(source)).toEqual({
      code: 'FORMULA_TOO_COMPLEX',
      position: 500,
      length: 1,
      params: { limit: 'LENGTH', max: 500 },
    });
  });

  it('accepts depth 32 and rejects depth 33', () => {
    expect(parse(`${'!'.repeat(31)}a`).ok).toBe(true);
    expect(failure(`${'!'.repeat(32)}a`)).toMatchObject({
      code: 'FORMULA_TOO_COMPLEX',
      position: 32,
      length: 1,
      params: { limit: 'DEPTH', max: 32 },
    });
  });

  it('accepts 200 nodes and rejects 201', () => {
    const call = (args: number) =>
      `max(${Array.from({ length: args }, () => 'a').join(',')})`;
    expect(parse(call(198)).ok).toBe(true);
    expect(failure(call(199))).toMatchObject({
      code: 'FORMULA_TOO_COMPLEX',
      params: { limit: 'NODES', max: 200 },
    });
  });
});
