import { describe, expect, it } from 'vitest';
import {
  estimate,
  objectVariables,
  type PricingData,
  puttyShareOn,
  RoomSelectionSchema,
} from '../src';
import {
  CATEGORY,
  PRODUCT,
  partialConfiguration,
  RULE,
  room,
  scopeData,
  select,
} from './fixtures/scope';

const share = (categoryId: string, productId: string, areaShare?: number) => ({
  ...select(categoryId, productId),
  ...(areaShare === undefined ? {} : { areaShare }),
});

const estimateOf = (
  selections: ReturnType<typeof share>[],
  data: PricingData = scopeData,
) =>
  estimate(
    partialConfiguration({ rooms: [room('bedroom', { selections })] }),
    data,
  );

const lineOf = (result: ReturnType<typeof estimate>, category: string) =>
  result.lines.find((line) => line.id === `MATERIALS:bedroom:${category}`);

const amountOf = (
  result: ReturnType<typeof estimate>,
  category: string,
  kind: string,
) =>
  lineOf(result, category)?.components?.find((item) => item.kind === kind)
    ?.amountCents;

const codeOf = (result: ReturnType<typeof estimate>, category: string) =>
  lineOf(result, category)?.error?.code;

const hasUnallocated = (result: ReturnType<typeof estimate>) =>
  result.warnings.some((item) => item.code === 'AREA_SHARE_UNALLOCATED');

const FLOOR_TILE = 'cat-floor-tile';
const floorRule = scopeData.rules.find((rule) => rule.id === RULE.floor);
if (floorRule === undefined) {
  throw new Error('floor rule missing');
}
const floorTileData: PricingData = {
  ...scopeData,
  categories: [
    ...scopeData.categories,
    {
      id: FLOOR_TILE,
      wastePercent: 0,
      surface: 'FLOOR',
      requiresPutty: true,
    },
  ],
  products: [
    ...scopeData.products,
    {
      id: 'p-floor-tile',
      categoryId: FLOOR_TILE,
      materialTypeId: 'mt-generic',
      priceCents: 3000,
      unit: 'SQM',
      wastePercentOverride: null,
      heatedFloorCompatible: true,
      available: true,
    },
  ],
  rules: [
    ...scopeData.rules,
    {
      ...floorRule,
      id: '00000000-0000-4000-8000-000000000031',
      categoryId: FLOOR_TILE,
    },
  ],
};

describe('legacy surfaces without shares', () => {
  it('counts every covering on the full area', () => {
    const result = estimateOf([
      share(CATEGORY.wallPaint, PRODUCT.wallPaint),
      share(CATEGORY.wallTile, PRODUCT.wallTile),
    ]);
    expect(lineOf(result, CATEGORY.wallPaint)?.quantity).toBe(35);
    expect(lineOf(result, CATEGORY.wallTile)?.quantity).toBe(35);
    expect(amountOf(result, CATEGORY.wallPaint, 'MATERIAL')).toBe(35000);
    expect(amountOf(result, CATEGORY.wallTile, 'MATERIAL')).toBe(140000);
    expect(result.warnings).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('ignores a selection without a product', () => {
    const result = estimateOf([
      { categoryId: CATEGORY.wallTile, productId: null, areaShare: 50 },
      share(CATEGORY.wallPaint, PRODUCT.wallPaint),
    ]);
    expect(lineOf(result, CATEGORY.wallPaint)?.quantity).toBe(35);
    expect(result.warnings).toEqual([]);
  });
});

describe('wall shares', () => {
  const result = estimateOf([
    share(CATEGORY.wallPaint, PRODUCT.wallPaint, 40),
    share(CATEGORY.wallTile, PRODUCT.wallTile, 60),
  ]);

  it('scales material and labour of each category by its share', () => {
    expect(lineOf(result, CATEGORY.wallPaint)?.quantity).toBe(14);
    expect(amountOf(result, CATEGORY.wallPaint, 'MATERIAL')).toBe(14000);
    expect(amountOf(result, CATEGORY.wallPaint, 'LABOR')).toBe(5460);
    expect(lineOf(result, CATEGORY.wallTile)?.quantity).toBe(21);
    expect(amountOf(result, CATEGORY.wallTile, 'MATERIAL')).toBe(84000);
    expect(amountOf(result, CATEGORY.wallTile, 'LABOR')).toBe(41370);
  });

  it('keeps surface preparation on the full area', () => {
    expect(amountOf(result, CATEGORY.wallPaint, 'PREP')).toBe(79100);
    expect(result.warnings).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('does not scale the perimeter or the other surfaces', () => {
    const mixed = estimateOf([
      share(CATEGORY.wallPaint, PRODUCT.wallPaint, 50),
      share(CATEGORY.skirting, PRODUCT.skirting),
      share(CATEGORY.ceiling, PRODUCT.ceiling),
    ]);
    expect(lineOf(mixed, CATEGORY.wallPaint)?.quantity).toBe(17.5);
    expect(lineOf(mixed, CATEGORY.skirting)?.quantity).toBe(14);
    expect(lineOf(mixed, CATEGORY.ceiling)?.quantity).toBe(12);
  });
});

describe('floor shares', () => {
  it('splits the floor between two coverings', () => {
    const result = estimateOf(
      [
        share(CATEGORY.floor, PRODUCT.floor, 50),
        share(FLOOR_TILE, 'p-floor-tile', 50),
      ],
      floorTileData,
    );
    expect(lineOf(result, CATEGORY.floor)?.quantity).toBe(6);
    expect(amountOf(result, CATEGORY.floor, 'MATERIAL')).toBe(13200);
    expect(amountOf(result, CATEGORY.floor, 'LABOR')).toBe(4200);
    expect(lineOf(result, FLOOR_TILE)?.quantity).toBe(6);
    expect(amountOf(result, FLOOR_TILE, 'MATERIAL')).toBe(19200);
  });
});

describe('putty with shares', () => {
  const configuration = partialConfiguration({
    rooms: [
      room('bedroom', {
        selections: [
          share(CATEGORY.wallTile, PRODUCT.wallTile, 25),
          share(CATEGORY.wallPaint, PRODUCT.wallPaint, 75),
        ],
      }),
    ],
  });

  it('limits puttyArea to the shares needing putty', () => {
    const [bedroom] = configuration.rooms;
    expect(puttyShareOn(bedroom ?? room('none'), scopeData.categories)).toBe(
      0.75,
    );
    const result = estimate(configuration, {
      ...scopeData,
      rules: scopeData.rules.map((rule) =>
        rule.id === RULE.surfaceWalls
          ? { ...rule, costFormula: 'puttyArea * 100' }
          : rule,
      ),
    });
    expect(amountOf(result, CATEGORY.wallTile, 'PREP')).toBe(262500);
  });

  it('scales roomsPuttyWallArea', () => {
    expect(
      objectVariables(configuration, scopeData.categories).roomsPuttyWallArea,
    ).toBe(26.25);
  });

  it('caps the share at one and falls back without selections', () => {
    const full = room('r', {
      selections: [
        share(CATEGORY.wallPaint, PRODUCT.wallPaint, 100),
        share(CATEGORY.wallTile, PRODUCT.wallTile, 100),
      ],
    });
    expect(puttyShareOn(full, scopeData.categories)).toBe(1);
    expect(puttyShareOn(room('r'), scopeData.categories)).toBe(1);
  });

  it('is zero in legacy mode without a category needing putty', () => {
    const only = room('r', {
      selections: [share(CATEGORY.wallTile, PRODUCT.wallTile)],
    });
    expect(puttyShareOn(only, scopeData.categories)).toBe(0);
  });

  it('counts a selection without a product in legacy mode', () => {
    const mixed = room('r', {
      selections: [
        share(CATEGORY.wallTile, PRODUCT.wallTile),
        { categoryId: CATEGORY.wallPaint, productId: null },
      ],
    });
    expect(puttyShareOn(mixed, scopeData.categories)).toBe(1);
  });
});

describe('share errors', () => {
  it('rejects a share on a ceiling or a category without a surface', () => {
    const result = estimateOf([
      share(CATEGORY.ceiling, PRODUCT.ceiling, 50),
      share(CATEGORY.skirting, PRODUCT.skirting, 50),
      share(CATEGORY.wallPaint, PRODUCT.wallPaint),
    ]);
    expect(codeOf(result, CATEGORY.ceiling)).toBe('AREA_SHARE_NOT_ALLOWED');
    expect(codeOf(result, CATEGORY.skirting)).toBe('AREA_SHARE_NOT_ALLOWED');
    expect(lineOf(result, CATEGORY.wallPaint)?.status).toBe('OK');
    expect(result.incomplete).toBe(true);
  });

  it('requires a share on every covering once one has it', () => {
    const result = estimateOf([
      share(CATEGORY.wallPaint, PRODUCT.wallPaint, 40),
      share(CATEGORY.wallTile, PRODUCT.wallTile),
    ]);
    expect(codeOf(result, CATEGORY.wallPaint)).toBe('AREA_SHARE_MISSING');
    expect(codeOf(result, CATEGORY.wallTile)).toBe('AREA_SHARE_MISSING');
    expect(lineOf(result, CATEGORY.wallTile)?.status).toBe('ERROR');
    expect(result.incomplete).toBe(true);
    expect(hasUnallocated(result)).toBe(false);
  });

  it('rejects shares above the whole surface', () => {
    const result = estimateOf([
      share(CATEGORY.wallPaint, PRODUCT.wallPaint, 60),
      share(CATEGORY.wallTile, PRODUCT.wallTile, 50),
    ]);
    expect(codeOf(result, CATEGORY.wallPaint)).toBe(
      'AREA_SHARE_EXCEEDS_SURFACE',
    );
    expect(lineOf(result, CATEGORY.wallTile)?.error).toEqual({
      code: 'AREA_SHARE_EXCEEDS_SURFACE',
      params: { roomClientId: 'bedroom', surface: 'WALLS', percent: 110 },
    });
    expect(result.incomplete).toBe(true);
    expect(hasUnallocated(result)).toBe(false);
  });
});

describe('unallocated share warning', () => {
  it('reports the remaining percent and area', () => {
    const result = estimateOf([
      share(CATEGORY.wallPaint, PRODUCT.wallPaint, 40),
      share(CATEGORY.wallTile, PRODUCT.wallTile, 35),
    ]);
    expect(result.warnings).toEqual([
      {
        code: 'AREA_SHARE_UNALLOCATED',
        params: {
          roomClientId: 'bedroom',
          surface: 'WALLS',
          percent: 25,
          sqm: 8.75,
        },
      },
    ]);
    expect(result.incomplete).toBe(false);
  });

  it('is silent when the shares fill the surface', () => {
    const result = estimateOf([
      share(CATEGORY.wallPaint, PRODUCT.wallPaint, 40),
      share(CATEGORY.wallTile, PRODUCT.wallTile, 60),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('reports the floor area', () => {
    const result = estimateOf([share(CATEGORY.floor, PRODUCT.floor, 70)]);
    expect(result.warnings).toEqual([
      {
        code: 'AREA_SHARE_UNALLOCATED',
        params: {
          roomClientId: 'bedroom',
          surface: 'FLOOR',
          percent: 30,
          sqm: 3.6,
        },
      },
    ]);
  });
});

describe('areaShare schema', () => {
  const parse = (areaShare: number) =>
    RoomSelectionSchema.safeParse({
      categoryId: 'c',
      productId: 'p',
      areaShare,
    }).success;

  it('accepts whole percents from 1 to 100', () => {
    expect(parse(1)).toBe(true);
    expect(parse(100)).toBe(true);
  });

  it('rejects 0, 101 and fractions', () => {
    expect(parse(0)).toBe(false);
    expect(parse(101)).toBe(false);
    expect(parse(33.5)).toBe(false);
  });

  it('stays optional', () => {
    expect(
      RoomSelectionSchema.safeParse({ categoryId: 'c', productId: null })
        .success,
    ).toBe(true);
  });
});
