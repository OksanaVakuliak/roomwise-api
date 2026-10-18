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

const livingFloor = 'MATERIALS:living:cat-floor';

const withLivingFloor = (
  productId: string,
  heatedFloor: boolean,
): Configuration => ({
  ...request,
  rooms: request.rooms.map((room) =>
    room.clientId === 'living'
      ? {
          ...room,
          heatedFloor,
          selections: room.selections.map((selection) =>
            selection.categoryId === 'cat-floor'
              ? { ...selection, productId }
              : selection,
          ),
        }
      : room,
  ),
});

const lineOf = (result: ReturnType<typeof estimate>, id: string) =>
  result.lines.find((line) => line.id === id);

const codes = (result: ReturnType<typeof estimate>) =>
  result.warnings.map((warning) => warning.code);

describe('heated floor warning', () => {
  it('warns on the line and in the summary and still computes the total', () => {
    const result = estimate(withLivingFloor('p-laminate', true), data);
    const warning = {
      code: 'HEATED_FLOOR_INCOMPATIBLE',
      params: { productId: 'p-laminate' },
    };
    expect(lineOf(result, livingFloor)?.warnings).toEqual([warning]);
    expect(result.warnings).toEqual([{ ...warning, lineId: livingFloor }]);
    expect(lineOf(result, livingFloor)?.amountCents).toBeGreaterThan(0);
    expect(result.totals.usdCents).toBeGreaterThan(0);
  });

  it('does not warn for a compatible product', () => {
    const result = estimate(withLivingFloor('p-tile', true), data);
    expect(codes(result)).toEqual([]);
  });

  it('does not warn without a heated floor', () => {
    const result = estimate(withLivingFloor('p-laminate', false), data);
    expect(codes(result)).toEqual([]);
  });

  it('ignores categories that are not a floor', () => {
    const incompatible: PricingData = {
      ...data,
      products: data.products.map((product) =>
        product.id === 'p-paint'
          ? { ...product, heatedFloorCompatible: false }
          : product,
      ),
    };
    const result = estimate(withLivingFloor('p-tile', true), incompatible);
    expect(result.warnings).toEqual([]);
  });

  it('does not warn for an unavailable product', () => {
    const unavailable: PricingData = {
      ...data,
      products: data.products.map((product) =>
        product.id === 'p-laminate'
          ? { ...product, available: false }
          : product,
      ),
    };
    const result = estimate(withLivingFloor('p-laminate', true), unavailable);
    expect(lineOf(result, livingFloor)?.status).toBe('UNAVAILABLE');
    expect(codes(result)).not.toContain('HEATED_FLOOR_INCOMPATIBLE');
  });

  it('keeps heatedFloor available to formulas', () => {
    const priced = (heatedFloor: boolean) =>
      lineOf(
        estimate(withLivingFloor('p-laminate', heatedFloor), {
          ...data,
          rules: data.rules.map((rule) =>
            rule.id === 'rule-floor'
              ? { ...rule, costFormula: 'quantity * (heatedFloor ? 2 : 1)' }
              : rule,
          ),
        }),
        livingFloor,
      )?.amountCents;
    expect(priced(true)).toBe((priced(false) ?? 0) * 2);
  });
});

describe('rooms area warning', () => {
  const withTotal = (totalAreaSqm: number): Configuration => ({
    ...request,
    totalAreaSqm,
  });

  it('warns when the rooms exceed the total area', () => {
    const result = estimate(withTotal(20), data);
    expect(result.warnings).toEqual([
      {
        code: 'ROOMS_AREA_EXCEEDS_TOTAL',
        params: { roomsAreaSqm: 24, totalAreaSqm: 20 },
      },
    ]);
    expect(result.totals.usdCents).toBeGreaterThan(0);
  });

  it('does not warn when the areas are equal', () => {
    expect(estimate(withTotal(24), data).warnings).toEqual([]);
  });

  it('rounds the rooms area before comparing', () => {
    const rooms = request.rooms.map((room, index) => ({
      ...room,
      lengthM: index === 0 ? 0.1 : 0.2,
      widthM: 1,
    }));
    const result = estimate({ ...request, rooms, totalAreaSqm: 0.3 }, data);
    expect(codes(result)).not.toContain('ROOMS_AREA_EXCEEDS_TOTAL');
  });

  it('keeps the precision of the rooms area', () => {
    const rooms = request.rooms
      .slice(0, 1)
      .map((room) => ({ ...room, lengthM: 3.35, widthM: 3.35 }));
    const result = estimate({ ...request, rooms, totalAreaSqm: 11.22 }, data);
    expect(result.warnings).toContainEqual({
      code: 'ROOMS_AREA_EXCEEDS_TOTAL',
      params: { roomsAreaSqm: 11.2225, totalAreaSqm: 11.22 },
    });
  });
});

describe('exchange rate warning', () => {
  it('warns for UAH without a rate', () => {
    const result = estimate(
      { ...request, currency: 'UAH' },
      { ...data, exchangeRate: null },
    );
    expect(result.warnings).toEqual([{ code: 'EXCHANGE_RATE_UNAVAILABLE' }]);
    expect(result.totals.usdCents).toBeGreaterThan(0);
  });

  it('does not warn for USD without a rate', () => {
    const result = estimate(request, { ...data, exchangeRate: null });
    expect(result.warnings).toEqual([]);
  });

  it('does not warn for UAH with a rate', () => {
    expect(estimate({ ...request, currency: 'UAH' }, data).warnings).toEqual(
      [],
    );
  });

  it('orders line warnings before the summary ones', () => {
    const result = estimate(
      {
        ...withLivingFloor('p-laminate', true),
        totalAreaSqm: 1,
        currency: 'UAH',
      },
      { ...data, exchangeRate: null },
    );
    expect(codes(result)).toEqual([
      'HEATED_FLOOR_INCOMPATIBLE',
      'ROOMS_AREA_EXCEEDS_TOTAL',
      'EXCHANGE_RATE_UNAVAILABLE',
    ]);
  });
});
