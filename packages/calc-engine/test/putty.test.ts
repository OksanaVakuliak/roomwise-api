import { describe, expect, it } from 'vitest';
import { puttyRequiredOn } from '../src';
import { CATEGORY, PRODUCT, room, scopeData, select } from './fixtures/scope';

const required = (selections: ReturnType<typeof select>[]) =>
  puttyRequiredOn(
    room('bedroom', { selections }),
    'WALLS',
    scopeData.categories,
  );

describe('puttyRequiredOn', () => {
  it('is true when nothing is selected on the surface', () => {
    expect(required([])).toBe(true);
    expect(required([select(CATEGORY.floor, PRODUCT.floor)])).toBe(true);
  });

  it('is false when only categories without putty are selected', () => {
    expect(required([select(CATEGORY.wallTile, PRODUCT.wallTile)])).toBe(false);
  });

  it('is true when a category needing putty is selected with tile', () => {
    expect(
      required([
        select(CATEGORY.wallTile, PRODUCT.wallTile),
        select(CATEGORY.wallPaint, PRODUCT.wallPaint),
      ]),
    ).toBe(true);
  });

  it('does not depend on the product availability', () => {
    expect(required([select(CATEGORY.wallPaint, 'missing-product')])).toBe(
      true,
    );
  });
});
