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

const wallLine = (category: string) => `MATERIALS:bedroom:${category}`;
const configuration = partialConfiguration({
  rooms: [
    room('bedroom', {
      selections: [
        select(CATEGORY.wallPaint, PRODUCT.wallPaint),
        select(CATEGORY.wallTile, PRODUCT.wallTile),
        select(CATEGORY.skirting, PRODUCT.skirting),
      ],
    }),
  ],
});

const withSurfaceRules = (
  change: (rule: (typeof scopeData.rules)[number]) => unknown,
) => ({
  ...scopeData,
  rules: scopeData.rules.flatMap((rule) => {
    const next = change(rule);
    return next === null ? [] : [next as typeof rule];
  }),
});

const prepOf = (
  result: ReturnType<typeof estimate>,
  id: string,
  kind = 'PREP',
) =>
  result.lines
    .find((line) => line.id === id)
    ?.components?.find((component) => component.kind === kind);

const puttyPrep = (categories: string[]) => {
  const products: Record<string, string> = {
    [CATEGORY.wallPaint]: PRODUCT.wallPaint,
    [CATEGORY.wallTile]: PRODUCT.wallTile,
  };
  const result = estimate(
    partialConfiguration({
      rooms: [
        room('bedroom', {
          selections: categories.map((id) =>
            select(id, products[id] as string),
          ),
        }),
      ],
    }),
    withSurfaceRules((rule) =>
      rule.id === RULE.surfaceWalls
        ? { ...rule, costFormula: 'puttyRequired ? 100 : 7' }
        : rule,
    ),
  );
  return categories.map((id) => prepOf(result, wallLine(id))?.amountCents);
};

describe('puttyRequired', () => {
  it('is true when a category needing putty shares the surface', () => {
    expect(puttyPrep([CATEGORY.wallPaint, CATEGORY.wallTile])).toEqual([
      10000, 0,
    ]);
    expect(puttyPrep([CATEGORY.wallTile, CATEGORY.wallPaint])).toEqual([
      10000, 0,
    ]);
  });

  it('is false when no category on the surface needs putty', () => {
    expect(puttyPrep([CATEGORY.wallTile])).toEqual([700]);
  });

  it('is true for a category that needs putty alone', () => {
    expect(puttyPrep([CATEGORY.wallPaint])).toEqual([10000]);
  });

  it('adds no surface line when nothing is selected on the surface', () => {
    expect(puttyPrep([])).toEqual([]);
  });
});

describe('surface preparation', () => {
  it('adds no PREP component for a category without a surface', () => {
    const result = estimate(configuration, scopeData);
    const skirting = result.lines.find(
      (line) => line.id === wallLine(CATEGORY.skirting),
    );
    expect(skirting?.components?.map((item) => item.kind)).toEqual([
      'MATERIAL',
      'LABOR',
    ]);
  });

  it('adds no PREP component when the surface has no rule', () => {
    const result = estimate(
      configuration,
      withSurfaceRules((rule) => (rule.level === 'SURFACE' ? null : rule)),
    );
    const paint = result.lines.find(
      (line) => line.id === wallLine(CATEGORY.wallPaint),
    );
    expect(paint?.components?.map((item) => item.kind)).toEqual([
      'MATERIAL',
      'LABOR',
    ]);
  });

  it('picks the SURFACE rule with the lowest sortOrder', () => {
    const duplicate = scopeData.rules.find(
      (rule) => rule.id === RULE.surfaceWalls,
    );
    if (duplicate === undefined) {
      throw new Error('fixture rule missing');
    }
    const result = estimate(configuration, {
      ...scopeData,
      rules: [
        ...scopeData.rules,
        {
          ...duplicate,
          id: '00000000-0000-4000-8000-0000000000ff',
          sortOrder: duplicate.sortOrder - 1,
          costFormula: '1',
        },
      ],
    });
    expect(prepOf(result, wallLine(CATEGORY.wallPaint))).toMatchObject({
      ruleId: '00000000-0000-4000-8000-0000000000ff',
      amountCents: 100,
    });
  });

  it('reports a failing SURFACE formula on every line of the surface', () => {
    const result = estimate(
      configuration,
      withSurfaceRules((rule) =>
        rule.level === 'SURFACE' && rule.surface === 'WALLS'
          ? { ...rule, costFormula: '1 / 0' }
          : rule,
      ),
    );
    for (const category of [CATEGORY.wallPaint, CATEGORY.wallTile]) {
      const line = result.lines.find((item) => item.id === wallLine(category));
      expect(line?.status).toBe('ERROR');
      expect(line?.error).toEqual({
        code: 'FORMULA_RUNTIME_ERROR',
        params: { reason: 'DIVISION_BY_ZERO' },
      });
    }
    const skirting = result.lines.find(
      (line) => line.id === wallLine(CATEGORY.skirting),
    );
    expect(skirting?.status).toBe('OK');
    expect(result.incomplete).toBe(true);
  });

  it('moves PREP to the next line when the first category failed', () => {
    const result = estimate(configuration, {
      ...scopeData,
      products: scopeData.products.map((product) =>
        product.id === PRODUCT.wallPaint
          ? { ...product, available: false }
          : product,
      ),
    });
    const paint = result.lines.find(
      (line) => line.id === wallLine(CATEGORY.wallPaint),
    );
    expect(paint?.status).toBe('UNAVAILABLE');
    expect(paint?.components).toBeUndefined();
    const tile = prepOf(result, wallLine(CATEGORY.wallTile));
    expect(tile?.ruleId).toBe(RULE.surfaceWalls);
    expect(tile?.amountCents).toBeGreaterThan(0);
    expect(tile?.sharedWithCategoryId).toBeUndefined();
    const carriers = result.lines.filter((line) =>
      line.components?.some(
        (item) => item.kind === 'PREP' && item.amountCents > 0,
      ),
    );
    expect(carriers).toHaveLength(1);
  });

  it('keeps the line amount equal to the sum of its components', () => {
    const result = estimate(configuration, scopeData);
    for (const line of result.lines) {
      if (line.components !== undefined) {
        expect(line.amountCents).toBe(
          line.components.reduce((sum, item) => sum + item.amountCents, 0),
        );
      }
    }
  });
});
