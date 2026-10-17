import type { Configuration, PricingData } from '@roomwise/calc-engine';
import { describe, expect, it } from 'vitest';
import { findUnknownReferences } from './find-unknown-references';

const data = {
  roomTypes: [{ id: 'rt-1', code: 'BEDROOM' }],
  categories: [{ id: 'cat-1', wastePercent: 0, surface: 'FLOOR' }],
  products: [{ id: 'prod-1' }],
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
});
