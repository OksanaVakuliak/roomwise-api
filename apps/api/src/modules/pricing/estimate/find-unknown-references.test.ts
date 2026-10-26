import type { Configuration, PricingData } from '@roomwise/calc-engine';
import { describe, expect, it } from 'vitest';
import { findUnknownReferences } from './find-unknown-references';

const data = {
  roomTypes: [{ id: 'rt-1', code: 'BEDROOM' }],
  categories: [
    { id: 'cat-1', wastePercent: 0, surface: 'FLOOR' },
    { id: 'cat-2', wastePercent: 0, surface: 'WALL' },
  ],
  products: [
    { id: 'prod-1', categoryId: 'cat-1' },
    { id: 'prod-2', categoryId: 'cat-2' },
  ],
  options: [{ id: 'opt-1' }],
} as unknown as PricingData;

function configuration(overrides: Partial<Configuration>): Configuration {
  return {
    finishLevel: 'ROUGH',
    totalAreaSqm: 50,
    balconyAreaSqm: 0,
    balconyTiles: false,
    gas: false,
    kitchenType: 'SEPARATE',
    rooms: [],
    options: [],
    currency: 'USD',
    ...overrides,
  };
}

describe('findUnknownReferences', () => {
  it('returns nothing for known references', () => {
    const result = findUnknownReferences(
      configuration({
        rooms: [
          {
            clientId: 'room-1',
            roomTypeCode: 'BEDROOM',
            lengthM: 4,
            widthM: 3,
            heightM: 2.7,
            heatedFloor: false,
            selections: [{ categoryId: 'cat-1', productId: 'prod-1' }],
          },
        ],
        options: [{ optionId: 'opt-1', roomClientIds: ['room-1'] }],
      }),
      data,
    );

    expect(result).toEqual([]);
  });

  it('reports every unknown id with its field path', () => {
    const result = findUnknownReferences(
      configuration({
        rooms: [
          {
            clientId: 'room-1',
            roomTypeCode: 'KITCHEN',
            lengthM: 4,
            widthM: 3,
            heightM: 2.7,
            heatedFloor: false,
            selections: [{ categoryId: 'cat-x', productId: 'prod-x' }],
          },
        ],
        options: [{ optionId: 'opt-x', roomClientIds: ['room-9'] }],
      }),
      data,
    );

    expect(result).toEqual([
      { field: 'rooms[0].roomTypeCode', id: 'KITCHEN' },
      { field: 'rooms[0].selections[0].categoryId', id: 'cat-x' },
      { field: 'rooms[0].selections[0].productId', id: 'prod-x' },
      { field: 'options[0].optionId', id: 'opt-x' },
      { field: 'options[0].roomClientIds[0]', id: 'room-9' },
    ]);
  });

  it('reports a product that belongs to another category', () => {
    const result = findUnknownReferences(
      configuration({
        rooms: [
          {
            clientId: 'room-1',
            roomTypeCode: 'BEDROOM',
            lengthM: 4,
            widthM: 3,
            heightM: 2.7,
            heatedFloor: false,
            selections: [{ categoryId: 'cat-1', productId: 'prod-2' }],
          },
        ],
      }),
      data,
    );

    expect(result).toEqual([
      { field: 'rooms[0].selections[0].productId', id: 'prod-2' },
    ]);
  });

  describe("with missing products tolerated as 'unavailable'", () => {
    const roomWith = (categoryId: string, productId: string) =>
      configuration({
        rooms: [
          {
            clientId: 'room-1',
            roomTypeCode: 'BEDROOM',
            lengthM: 4,
            widthM: 3,
            heightM: 2.7,
            heatedFloor: false,
            selections: [{ categoryId, productId }],
          },
        ],
      });

    it('accepts a product id absent from the pricing data', () => {
      const result = findUnknownReferences(
        roomWith('cat-1', 'deleted'),
        data,
        'unavailable',
      );

      expect(result).toEqual([]);
    });

    it('accepts a product moved to another category', () => {
      const result = findUnknownReferences(
        roomWith('cat-1', 'prod-2'),
        data,
        'unavailable',
      );

      expect(result).toEqual([]);
    });

    it('accepts a category absent from the pricing data', () => {
      const result = findUnknownReferences(
        roomWith('cat-x', 'deleted'),
        data,
        'unavailable',
      );

      expect(result).toEqual([]);
    });

    it('accepts an option absent from the pricing data', () => {
      const result = findUnknownReferences(
        configuration({ options: [{ optionId: 'opt-x' }] }),
        data,
        'unavailable',
      );

      expect(result).toEqual([]);
    });

    it('still reports an unknown room type and room client id', () => {
      const result = findUnknownReferences(
        configuration({
          rooms: [
            {
              clientId: 'room-1',
              roomTypeCode: 'KITCHEN',
              lengthM: 4,
              widthM: 3,
              heightM: 2.7,
              heatedFloor: false,
              selections: [],
            },
          ],
          options: [{ optionId: 'opt-x', roomClientIds: ['room-9'] }],
        }),
        data,
        'unavailable',
      );

      expect(result).toEqual([
        { field: 'rooms[0].roomTypeCode', id: 'KITCHEN' },
        { field: 'options[0].roomClientIds[0]', id: 'room-9' },
      ]);
    });

    it('rejects a missing category and option by default', () => {
      expect(
        findUnknownReferences(
          {
            ...roomWith('cat-x', 'deleted'),
            options: [{ optionId: 'opt-x' }],
          },
          data,
        ),
      ).toEqual([
        { field: 'rooms[0].selections[0].categoryId', id: 'cat-x' },
        { field: 'rooms[0].selections[0].productId', id: 'deleted' },
        { field: 'options[0].optionId', id: 'opt-x' },
      ]);
    });

    it('rejects a missing product by default', () => {
      expect(findUnknownReferences(roomWith('cat-1', 'deleted'), data)).toEqual(
        [{ field: 'rooms[0].selections[0].productId', id: 'deleted' }],
      );
    });
  });
});
