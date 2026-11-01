import { describe, expect, it } from 'vitest';
import { estimate } from '../src';
import {
  CATEGORY,
  PRODUCT,
  partialConfiguration,
  RULE,
  room,
  scopeData,
  select,
} from './fixtures/scope';

const configuration = partialConfiguration({
  rooms: [
    room('bedroom', {
      selections: [select(CATEGORY.floor, PRODUCT.floor)],
    }),
  ],
});
const lineId = `MATERIALS:bedroom:${CATEGORY.floor}`;

const withLabor = (laborFormula: string) => ({
  ...scopeData,
  rules: scopeData.rules.map((rule) =>
    rule.id === RULE.floor ? { ...rule, laborFormula } : rule,
  ),
});

describe('material line labor component', () => {
  it('reports a failing laborFormula on the line', () => {
    const result = estimate(configuration, withLabor('1 / 0'));
    const line = result.lines.find((item) => item.id === lineId);
    expect(line?.status).toBe('ERROR');
    expect(line?.error).toEqual({
      code: 'FORMULA_RUNTIME_ERROR',
      params: { reason: 'DIVISION_BY_ZERO' },
    });
    expect(result.incomplete).toBe(true);
  });

  it('reports a syntax error of a laborFormula', () => {
    const result = estimate(configuration, withLabor('quantity *'));
    const line = result.lines.find((item) => item.id === lineId);
    expect(line?.status).toBe('ERROR');
    expect(line?.error?.code).toBe('FORMULA_SYNTAX');
  });

  it('rounds each component to cents before summing', () => {
    const result = estimate(configuration, withLabor('0.004 + 0.004'));
    const line = result.lines.find((item) => item.id === lineId);
    const labor = line?.components?.find((item) => item.kind === 'LABOR');
    expect(labor?.amountCents).toBe(1);
    const material = line?.components?.find((item) => item.kind === 'MATERIAL');
    expect(line?.amountCents).toBe((material?.amountCents ?? 0) + 1);
  });
});
