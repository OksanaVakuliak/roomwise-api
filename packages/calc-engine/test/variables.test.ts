import { describe, expect, it } from 'vitest';
import type {
  Configuration,
  PricingCategory,
  PricingProduct,
  RoomConfiguration,
  RoomTypeCode,
} from '../src';
import { objectVariables, productVariables, roomVariables } from '../src';
import { CATEGORY, PRODUCT, scopeData, select } from './fixtures/scope';

const objectOf = (
  value: Configuration,
  categories: readonly PricingCategory[] = [],
) => objectVariables(value, categories);

const room = (
  roomTypeCode: RoomTypeCode,
  overrides: Partial<RoomConfiguration> = {},
): RoomConfiguration => ({
  clientId: roomTypeCode,
  roomTypeCode,
  lengthM: 5,
  widthM: 4,
  heightM: 2.5,
  heatedFloor: false,
  selections: [],
  ...overrides,
});

const configuration = (rooms: RoomConfiguration[]): Configuration => ({
  scope: 'FULL',
  finishLevel: 'PRE_FINISH',
  totalAreaSqm: 72.5,
  balconyAreaSqm: 4,
  balconyTiles: true,
  rooms,
  options: [],
  currency: 'USD',
});

const category: PricingCategory = {
  id: 'c1',
  wastePercent: 10,
  surface: 'FLOOR',
  requiresPutty: true,
};

const product = (overrides: Partial<PricingProduct> = {}): PricingProduct => ({
  id: 'p1',
  categoryId: 'c1',
  materialTypeId: 'm1',
  priceCents: 1999,
  unit: 'SQM',
  wastePercentOverride: null,
  heatedFloorCompatible: true,
  available: true,
  ...overrides,
});

describe('roomVariables', () => {
  it('derives areas and perimeter from dimensions', () => {
    const vars = roomVariables(room('BEDROOM', { heatedFloor: true }));
    expect(vars).toEqual({
      length: 5,
      width: 4,
      height: 2.5,
      floorArea: 20,
      perimeter: 18,
      wallArea: 45,
      heatedFloor: true,
      roomType: 'BEDROOM',
    });
  });

  it('does not subtract doors or windows from wall area', () => {
    expect(roomVariables(room('KITCHEN')).wallArea).toBe(18 * 2.5);
  });
});

describe('productVariables', () => {
  it('converts price to dollars and uses the category waste', () => {
    expect(productVariables(product(), category)).toEqual({
      price: 19.99,
      waste: 0.1,
      unit: 'SQM',
    });
  });

  it('prefers the product waste override, including zero', () => {
    expect(
      productVariables(product({ wastePercentOverride: 15 }), category).waste,
    ).toBe(0.15);
    expect(
      productVariables(product({ wastePercentOverride: 0 }), category).waste,
    ).toBe(0);
  });
});

describe('objectVariables', () => {
  it('exposes object fields and counts rooms by type', () => {
    const vars = objectOf(
      configuration([
        room('LIVING_ROOM'),
        room('BEDROOM', { clientId: 'b1' }),
        room('BEDROOM', { clientId: 'b2' }),
        room('KITCHEN'),
        room('BATHROOM'),
      ]),
    );
    expect(vars).toEqual({
      scope: 'FULL',
      totalArea: 72.5,
      balconyArea: 4,
      balconyTiles: true,
      finishLevel: 'PRE_FINISH',
      roomsCount: 3,
      bathroomsCount: 1,
      roomsFloorArea: 100,
      roomsWallArea: 225,
      roomsPuttyWallArea: 225,
      roomsPerimeter: 90,
      wetRoomsCount: 2,
    });
  });

  it('uses the rooms floor area as total area when the scope is partial', () => {
    const partial: Configuration = {
      ...configuration([room('BEDROOM'), room('KITCHEN')]),
      scope: 'PARTIAL',
      totalAreaSqm: null,
    };
    const vars = objectOf(partial);
    expect(vars.scope).toBe('PARTIAL');
    expect(vars.totalArea).toBe(40);
    expect(vars.roomsFloorArea).toBe(40);
  });

  it('falls back to the rooms floor area when the full scope has no total area', () => {
    const vars = objectOf({
      ...configuration([room('BEDROOM')]),
      totalAreaSqm: null,
    });
    expect(vars.totalArea).toBe(20);
  });

  it('sums room areas and counts wet rooms including kitchen-living', () => {
    const vars = objectOf(
      configuration([
        room('KITCHEN_LIVING', { lengthM: 6, widthM: 3, heightM: 3 }),
        room('BATHROOM', { lengthM: 2, widthM: 2, heightM: 2 }),
        room('BEDROOM'),
        room('HALLWAY'),
      ]),
    );
    expect(vars.wetRoomsCount).toBe(2);
    expect(vars.roomsFloorArea).toBe(18 + 4 + 20 + 20);
    expect(vars.roomsPerimeter).toBe(18 + 8 + 18 + 18);
    expect(vars.roomsWallArea).toBe(18 * 3 + 8 * 2 + 45 + 45);
  });

  it('sums wall area only over rooms whose wall selections need putty', () => {
    const tileOnly = [select(CATEGORY.wallTile, PRODUCT.wallTile)];
    const painted = [
      select(CATEGORY.wallTile, PRODUCT.wallTile),
      select(CATEGORY.wallPaint, PRODUCT.wallPaint),
    ];
    const vars = objectOf(
      configuration([
        room('BATHROOM', { clientId: 'bath', selections: tileOnly }),
        room('BEDROOM', { clientId: 'bed', selections: painted }),
        room('LIVING_ROOM', { clientId: 'living' }),
      ]),
      scopeData.categories,
    );
    expect(vars.roomsWallArea).toBe(135);
    expect(vars.roomsPuttyWallArea).toBe(90);
  });

  it('counts a kitchen-living room as a room and a separate kitchen as none', () => {
    const vars = objectOf(
      configuration([room('KITCHEN_LIVING'), room('KITCHEN')]),
    );
    expect(vars.roomsCount).toBe(1);
    expect(vars.bathroomsCount).toBe(0);
  });

  it('does not count a hallway or a storage room as a room', () => {
    const vars = objectOf(
      configuration([room('BEDROOM'), room('HALLWAY'), room('STORAGE')]),
    );
    expect(vars.roomsCount).toBe(1);
    expect(vars.bathroomsCount).toBe(0);
  });
});
