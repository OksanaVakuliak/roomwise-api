import { describe, expect, it } from 'vitest';
import {
  type Configuration,
  ConfigurationSchema,
  estimate,
  type PricingData,
  PricingDataSchema,
} from '../src';
import reference from './fixtures/reference/us1-reference.json';
import referenceRequest from './fixtures/reference/us1-reference.request.json';

const data = PricingDataSchema.parse(reference.pricingData);
const request = ConfigurationSchema.parse(referenceRequest);

const withRules = (
  patch: (rule: PricingData['rules'][number]) => PricingData['rules'][number],
): PricingData => ({ ...data, rules: data.rules.map(patch) });

const lineOf = (result: ReturnType<typeof estimate>, id: string) =>
  result.lines.find((line) => line.id === id);

describe('estimate formula failures', () => {
  it('reports a syntax error of a cost formula on the line', () => {
    const result = estimate(
      request,
      withRules((rule) =>
        rule.id === 'rule-walls'
          ? { ...rule, costFormula: 'quantity *' }
          : rule,
      ),
    );
    const line = lineOf(result, 'MATERIALS:living:cat-walls');
    expect(line?.status).toBe('ERROR');
    expect(line?.error?.code).toBe('FORMULA_SYNTAX');
    expect(result.incomplete).toBe(true);
  });

  it('reports a failing quantity formula', () => {
    const result = estimate(
      request,
      withRules((rule) =>
        rule.id === 'rule-walls' ? { ...rule, quantityFormula: '1 / 0' } : rule,
      ),
    );
    expect(lineOf(result, 'MATERIALS:living:cat-walls')?.error).toEqual({
      code: 'FORMULA_RUNTIME_ERROR',
      params: { reason: 'DIVISION_BY_ZERO' },
    });
  });

  it('rejects a negative result', () => {
    const result = estimate(
      request,
      withRules((rule) =>
        rule.id === 'rule-walls' ? { ...rule, costFormula: '0 - price' } : rule,
      ),
    );
    expect(lineOf(result, 'MATERIALS:living:cat-walls')?.error).toEqual({
      code: 'FORMULA_RUNTIME_ERROR',
      params: { reason: 'NEGATIVE' },
    });
  });

  it('rejects a non-numeric result', () => {
    const result = estimate(
      request,
      withRules((rule) =>
        rule.id === 'rule-walls' ? { ...rule, costFormula: 'gas' } : rule,
      ),
    );
    expect(lineOf(result, 'MATERIALS:living:cat-walls')?.error).toEqual({
      code: 'FORMULA_RUNTIME_ERROR',
      params: { reason: 'TYPE_MISMATCH' },
    });
  });

  it('reports a quantity formula that is missing', () => {
    const result = estimate(
      request,
      withRules((rule) =>
        rule.id === 'rule-walls' ? { ...rule, quantityFormula: null } : rule,
      ),
    );
    expect(lineOf(result, 'MATERIALS:living:cat-walls')?.status).toBe('ERROR');
  });

  it('reports a failing object rule without stopping the others', () => {
    const result = estimate(
      request,
      withRules((rule) =>
        rule.level === 'OBJECT' ? { ...rule, costFormula: 'gas' } : rule,
      ),
    );
    expect(lineOf(result, 'OBJECT:rule-balcony-tile')?.status).toBe('ERROR');
    expect(lineOf(result, 'BASE')?.status).toBe('OK');
    expect(result.incomplete).toBe(true);
  });

  it('orders object rules by sortOrder', () => {
    const second = {
      ...data.rules[4],
      id: 'rule-first',
      costFormula: '0',
      sortOrder: -1,
    };
    const result = estimate(request, {
      ...data,
      rules: [...data.rules, second],
    });
    const ids = result.lines
      .filter((line) => line.section === 'OBJECT')
      .map((line) => line.id);
    expect(ids).toEqual(['OBJECT:rule-first', 'OBJECT:rule-balcony-tile']);
  });
});

describe('estimate references and options', () => {
  it('marks a product missing from the dataset as unavailable', () => {
    const result = estimate(request, {
      ...data,
      products: data.products.filter((product) => product.id !== 'p-paint'),
    });
    expect(lineOf(result, 'MATERIALS:living:cat-walls')?.status).toBe(
      'UNAVAILABLE',
    );
  });

  it('marks an unavailable option and ignores an unknown one', () => {
    const result = estimate(
      {
        ...request,
        options: [{ optionId: 'opt-design' }, { optionId: 'opt-missing' }],
      },
      {
        ...data,
        options: data.options.map((option) =>
          option.id === 'opt-design' ? { ...option, available: false } : option,
        ),
      },
    );
    expect(lineOf(result, 'ADDITIONAL:option:opt-design')).toMatchObject({
      status: 'UNAVAILABLE',
      amountCents: 0,
      error: { code: 'PRODUCT_UNAVAILABLE' },
    });
    expect(result.lines.some((line) => line.optionId === 'opt-missing')).toBe(
      false,
    );
    expect(result.incomplete).toBe(false);
  });

  it('uses the minimum quantity, then one, for a piece option without quantity', () => {
    const run = (minQuantity: number | null) =>
      estimate(
        { ...request, options: [{ optionId: 'opt-ac' }] },
        {
          ...data,
          options: data.options.map((option) =>
            option.id === 'opt-ac' ? { ...option, minQuantity } : option,
          ),
        },
      );
    expect(lineOf(run(2), 'ENGINEERING:option:opt-ac')?.quantity).toBe(2);
    expect(lineOf(run(null), 'ENGINEERING:option:opt-ac')?.quantity).toBe(1);
  });

  it('prices package items by room count and room area', () => {
    const result = estimate(request, {
      ...data,
      packageItems: [
        {
          id: 'pk-rooms',
          includedInBase: false,
          priceCents: 1000,
          unit: 'ROOM',
        },
        {
          id: 'pk-area',
          includedInBase: false,
          priceCents: 500,
          unit: 'ROOM_SQM',
        },
        {
          id: 'pk-pieces',
          includedInBase: false,
          priceCents: 700,
          unit: 'PIECE',
        },
      ],
    });
    expect(lineOf(result, 'ENGINEERING:package:pk-rooms')).toMatchObject({
      quantity: 2,
      amountCents: 2000,
    });
    expect(lineOf(result, 'ENGINEERING:package:pk-area')).toMatchObject({
      quantity: 24,
      amountCents: 12000,
    });
    expect(lineOf(result, 'ENGINEERING:package:pk-pieces')).toMatchObject({
      quantity: 1,
      amountCents: 700,
    });
  });

  it('does not calculate a chargeable package item without a price', () => {
    const result = estimate(request, {
      ...data,
      packageItems: [
        {
          id: 'pk-broken',
          includedInBase: false,
          priceCents: null,
          unit: null,
        },
      ],
    });
    expect(lineOf(result, 'ENGINEERING:package:pk-broken')).toMatchObject({
      status: 'NOT_CALCULATED',
      error: { code: 'PACKAGE_ITEM_PRICE_MISSING' },
    });
    expect(result.incomplete).toBe(true);
  });

  it('ignores unknown room ids of a room option', () => {
    const configuration: Configuration = {
      ...request,
      options: [{ optionId: 'opt-smart-switches', roomClientIds: ['nowhere'] }],
    };
    const result = estimate(configuration, data);
    expect(
      lineOf(result, 'ADDITIONAL:option:opt-smart-switches'),
    ).toMatchObject({ quantity: 0, amountCents: 0 });
  });

  it('leaves the UAH amounts empty without an exchange rate', () => {
    const result = estimate(request, { ...data, exchangeRate: null });
    expect(result.totals.uahKopecks).toBeNull();
    expect(result.lines.every((line) => line.amountUahKopecks === null)).toBe(
      true,
    );
  });
});
