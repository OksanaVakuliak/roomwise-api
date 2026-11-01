import { describe, expect, it } from 'vitest';
import type { Configuration, PricingOption } from '../src';
import { optionLine } from '../src/estimate/option-line';

const configuration = (scope: 'FULL' | 'PARTIAL'): Configuration => ({
  scope,
  finishLevel: 'ROUGH',
  totalAreaSqm: scope === 'FULL' ? 10 : null,
  balconyAreaSqm: 0,
  balconyTiles: false,
  rooms: [],
  options: [],
  currency: 'USD',
});

const option = (patch: Partial<PricingOption>): PricingOption => ({
  id: 'opt',
  code: null,
  kind: 'ADDITIONAL',
  priceCents: 500,
  unit: 'PROJECT',
  roomTypeCodes: [],
  priceCoefficientKeys: [],
  scopes: ['FULL', 'PARTIAL'],
  minQuantity: null,
  maxQuantity: null,
  available: true,
  ...patch,
});

const line = (
  scope: 'FULL' | 'PARTIAL',
  patch: Partial<PricingOption>,
  coefficients: Record<string, number> = {},
) =>
  optionLine(
    configuration(scope),
    option(patch),
    { optionId: 'opt' },
    coefficients,
  );

describe('option line pricing', () => {
  it('uses priceCents when no coefficient keys are set', () => {
    expect(line('FULL', {})).toMatchObject({
      status: 'OK',
      unitPriceCents: 500,
      amountCents: 500,
    });
  });

  it('sums coefficients in cents and rounds to cents', () => {
    expect(
      line(
        'PARTIAL',
        { priceCoefficientKeys: ['a', 'b'] },
        { a: 9.2, b: 11.005 },
      ),
    ).toMatchObject({ status: 'OK', unitPriceCents: 2021, amountCents: 2021 });
  });

  it('fails the line on a missing coefficient', () => {
    expect(
      line('PARTIAL', { priceCoefficientKeys: ['a', 'missing'] }, { a: 1 }),
    ).toMatchObject({
      status: 'ERROR',
      amountCents: 0,
      error: { code: 'UNKNOWN_COEFFICIENT', params: { key: 'missing' } },
    });
  });

  it('rejects a scope outside the option scopes before availability', () => {
    expect(
      line('FULL', { scopes: ['PARTIAL'], available: false }),
    ).toMatchObject({
      status: 'UNAVAILABLE',
      amountCents: 0,
      error: { code: 'OPTION_SCOPE_NOT_ALLOWED' },
    });
  });
});
