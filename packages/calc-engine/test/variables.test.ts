import { describe, expect, it } from 'vitest';
import type {
  Configuration,
  PricingCategory,
  PricingProduct,
  RoomConfiguration,
  RoomTypeCode,
} from '../src';
import { objectVariables, productVariables, roomVariables } from '../src';

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
  finishLevel: 'PRE_FINISH',
  totalAreaSqm: 72.5,
  balconyAreaSqm: 4,
  balconyTiles: true,
  gas: false,
  kitchenType: 'SEPARATE',
  rooms,
  options: [],
  currency: 'USD',
});

const category: PricingCategory = {
  id: 'c1',
  wastePercent: 10,
  surface: 'FLOOR',
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
    const vars = objectVariables(
      configuration([
        room('LIVING_ROOM'),
        room('BEDROOM', { clientId: 'b1' }),
        room('BEDROOM', { clientId: 'b2' }),
        room('KITCHEN'),
        room('BATHROOM'),
      ]),
    );
    expect(vars).toEqual({
      totalArea: 72.5,
      balconyArea: 4,
      balconyTiles: true,
      gas: false,
      kitchenType: 'SEPARATE',
      finishLevel: 'PRE_FINISH',
      roomsCount: 3,
      bathroomsCount: 1,
    });
  });

  it('counts a kitchen-living room as a room and a separate kitchen as none', () => {
    const vars = objectVariables(
      configuration([room('KITCHEN_LIVING'), room('KITCHEN')]),
    );
    expect(vars.roomsCount).toBe(1);
    expect(vars.bathroomsCount).toBe(0);
  });
});
