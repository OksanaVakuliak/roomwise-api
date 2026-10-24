import { describe, expect, it } from 'vitest';
import { checkLimits } from '../src/estimate/limits';
import type {
  Configuration,
  PricingData,
  PricingOption,
  RoomConfiguration,
} from '../src/schemas';

const limits: PricingData['limits'] = {
  totalAreaSqm: { min: 15, max: 500 },
  rooms: { min: 1, max: 15 },
  roomSideM: { min: 1, max: 30 },
  roomHeightM: { min: 2.2, max: 5 },
};

const room = (
  overrides: Partial<RoomConfiguration> = {},
): RoomConfiguration => ({
  clientId: 'r1',
  roomTypeCode: 'BEDROOM',
  lengthM: 5,
  widthM: 4,
  heightM: 2.7,
  heatedFloor: false,
  selections: [],
  ...overrides,
});

const configuration = (
  overrides: Partial<Configuration> = {},
): Configuration => ({
  finishLevel: 'PRE_FINISH',
  totalAreaSqm: 60,
  balconyAreaSqm: 4,
  balconyTiles: false,
  gas: false,
  kitchenType: 'SEPARATE',
  rooms: [room()],
  options: [],
  currency: 'USD',
  ...overrides,
});

const pieceOption = (
  overrides: Partial<PricingOption> = {},
): PricingOption => ({
  id: 'o1',
  code: null,
  kind: 'ADDITIONAL',
  priceCents: 1000,
  unit: 'PIECE',
  roomTypeCodes: [],
  minQuantity: 1,
  maxQuantity: 10,
  available: true,
  ...overrides,
});

const fields = (config: Configuration, options: PricingOption[] = []) =>
  checkLimits(config, limits, options).map((violation) => violation.field);

describe('checkLimits', () => {
  it('returns nothing for a configuration within limits', () => {
    expect(checkLimits(configuration(), limits)).toEqual([]);
  });

  it.each([
    [15, false],
    [500, false],
    [14.99, true],
    [500.01, true],
  ])('total area %s violation=%s', (totalAreaSqm, violated) => {
    expect(
      fields(configuration({ totalAreaSqm, balconyAreaSqm: 0 })).includes(
        'totalAreaSqm',
      ),
    ).toBe(violated);
  });

  it('reports total area bounds', () => {
    expect(
      checkLimits(
        configuration({ totalAreaSqm: 10, balconyAreaSqm: 0 }),
        limits,
      ),
    ).toEqual([{ field: 'totalAreaSqm', min: 15, max: 500 }]);
  });

  it.each([
    [0, false],
    [60, false],
    [-0.1, true],
    [60.1, true],
  ])('balcony area %s violation=%s', (balconyAreaSqm, violated) => {
    expect(fields(configuration({ balconyAreaSqm }))).toEqual(
      violated ? ['balconyAreaSqm'] : [],
    );
  });

  it('bounds the balcony by the total area', () => {
    expect(checkLimits(configuration({ balconyAreaSqm: 61 }), limits)).toEqual([
      { field: 'balconyAreaSqm', min: 0, max: 60 },
    ]);
  });

  it.each([
    [0, true],
    [1, false],
    [15, false],
    [16, true],
  ])('room count %s violation=%s', (count, violated) => {
    const rooms = Array.from({ length: count }, (_, i) =>
      room({ clientId: `r${i}` }),
    );
    expect(fields(configuration({ rooms }))).toEqual(violated ? ['rooms'] : []);
  });

  it('reports room count bounds', () => {
    expect(checkLimits(configuration({ rooms: [] }), limits)).toEqual([
      { field: 'rooms', min: 1, max: 15 },
    ]);
  });

  it.each([
    [1, false],
    [30, false],
    [0.99, true],
    [30.01, true],
  ])('room side %s violation=%s', (side, violated) => {
    expect(fields(configuration({ rooms: [room({ lengthM: side })] }))).toEqual(
      violated ? ['rooms[0].lengthM'] : [],
    );
    expect(fields(configuration({ rooms: [room({ widthM: side })] }))).toEqual(
      violated ? ['rooms[0].widthM'] : [],
    );
  });

  it.each([
    [2.2, false],
    [5, false],
    [2.19, true],
    [5.01, true],
  ])('room height %s violation=%s', (heightM, violated) => {
    expect(fields(configuration({ rooms: [room({ heightM })] }))).toEqual(
      violated ? ['rooms[0].heightM'] : [],
    );
  });

  it('carries the room index in the path and the bounds', () => {
    const rooms = [
      room(),
      room({ clientId: 'r2' }),
      room({ clientId: 'r3', heightM: 6 }),
    ];
    expect(checkLimits(configuration({ rooms }), limits)).toEqual([
      { field: 'rooms[2].heightM', min: 2.2, max: 5 },
    ]);
  });

  it('collects every violation', () => {
    const rooms = [room({ lengthM: 31, widthM: 0.5, heightM: 1 })];
    expect(fields(configuration({ rooms }))).toEqual([
      'rooms[0].lengthM',
      'rooms[0].widthM',
      'rooms[0].heightM',
    ]);
  });

  describe('piece option quantity', () => {
    const select = (quantity: number | undefined) =>
      configuration({ options: [{ optionId: 'o1', quantity }] });

    it.each([
      [1, false],
      [10, false],
      [0, true],
      [11, true],
    ])('quantity %s violation=%s', (quantity, violated) => {
      expect(fields(select(quantity), [pieceOption()])).toEqual(
        violated ? ['options[0].quantity'] : [],
      );
    });

    it('reports the option bounds', () => {
      expect(checkLimits(select(11), limits, [pieceOption()])).toEqual([
        { field: 'options[0].quantity', min: 1, max: 10 },
      ]);
    });

    it('treats missing bounds as open', () => {
      const open = pieceOption({ minQuantity: null, maxQuantity: null });
      expect(fields(select(1000), [open])).toEqual([]);
      expect(fields(select(0), [open])).toEqual(['options[0].quantity']);
    });

    it('ignores options that are not piece based', () => {
      expect(fields(select(99), [pieceOption({ unit: 'PROJECT' })])).toEqual(
        [],
      );
    });

    it('ignores unknown options and missing quantity', () => {
      expect(fields(select(99), [])).toEqual([]);
      expect(fields(select(undefined), [pieceOption()])).toEqual([]);
    });
  });
});
