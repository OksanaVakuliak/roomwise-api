import { describe, expect, it } from 'vitest';
import { estimate, type PricingData } from '../src';
import {
  fullConfiguration,
  partialConfiguration,
  RULE,
  scopeData,
} from './fixtures/scope';

const baseRule = scopeData.rules.find((rule) => rule.id === RULE.baseScreed);
const objectRule = scopeData.rules.find((rule) => rule.id === RULE.balconyTile);

if (baseRule === undefined || objectRule === undefined) {
  throw new Error('fixture rules missing');
}

const withRules = (rules: PricingData['rules']): PricingData => ({
  ...scopeData,
  rules,
});

const sectionOf = (result: ReturnType<typeof estimate>, section: string) =>
  result.lines.filter((line) => line.section === section);

describe('estimate BASE section', () => {
  it('omits a BASE line with zero sum and OK status', () => {
    const result = estimate(
      fullConfiguration(),
      withRules([{ ...baseRule, costFormula: '0' }]),
    );
    expect(sectionOf(result, 'BASE')).toEqual([]);
  });

  it('keeps a priced BASE line', () => {
    const result = estimate(
      fullConfiguration(),
      withRules([{ ...baseRule, costFormula: 'totalArea * 2' }]),
    );
    const [line] = sectionOf(result, 'BASE');
    expect(line?.id).toBe(`BASE:${baseRule.id}`);
    expect(line?.amountCents).toBe(12000);
  });

  it('keeps a BASE line that failed', () => {
    const result = estimate(
      fullConfiguration(),
      withRules([{ ...baseRule, costFormula: 'unknownVariable' }]),
    );
    const [line] = sectionOf(result, 'BASE');
    expect(line?.status).toBe('ERROR');
    expect(result.incomplete).toBe(true);
  });

  it('has no BASE lines in a partial renovation', () => {
    const result = estimate(
      partialConfiguration(),
      withRules([{ ...baseRule, costFormula: '100' }]),
    );
    expect(sectionOf(result, 'BASE')).toEqual([]);
    expect(sectionOf(result, 'OBJECT')).toEqual([]);
  });

  it('keeps a non-base OBJECT rule in the OBJECT section', () => {
    const result = estimate(
      partialConfiguration({ balconyAreaSqm: 5, balconyTiles: true }),
      withRules([{ ...objectRule, costFormula: '50' }]),
    );
    const [line] = sectionOf(result, 'OBJECT');
    expect(line?.id).toBe(`OBJECT:${objectRule.id}`);
    expect(sectionOf(result, 'BASE')).toEqual([]);
  });

  it('puts BASE lines before OBJECT lines', () => {
    const result = estimate(
      fullConfiguration({ balconyAreaSqm: 5, balconyTiles: true }),
      withRules([
        { ...objectRule, costFormula: '50' },
        { ...baseRule, costFormula: '100' },
      ]),
    );
    expect(
      result.lines
        .map((line) => line.section)
        .filter((section) => section === 'BASE' || section === 'OBJECT'),
    ).toEqual(['BASE', 'OBJECT']);
  });
});
