import { describe, expect, it } from 'vitest';
import { SNAPSHOT_SCHEMA_VERSION, SnapshotV1Schema } from './snapshot.schema';

const name = (en: string) => ({ en, uk: `${en}-uk` });

const buildSnapshot = () => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  createdAt: '2026-10-22T10:00:00.000Z',
  pricingVersion: 'v1',
  configuration: {
    finishLevel: 'ROUGH',
    totalAreaSqm: 50,
    balconyAreaSqm: 0,
    balconyTiles: false,
    gas: true,
    kitchenType: 'SEPARATE',
    rooms: [
      {
        clientId: 'r1',
        roomTypeCode: 'BEDROOM',
        lengthM: 4,
        widthM: 3,
        heightM: 2.7,
        heatedFloor: false,
        selections: [{ categoryId: 'c1', productId: 'p1' }],
      },
    ],
    options: [],
    currency: 'USD',
  },
  style: { id: 's1', name: name('Modern') },
  rooms: [
    {
      clientId: 'r1',
      roomTypeCode: 'BEDROOM',
      roomTypeName: name('Bedroom'),
      lengthM: 4,
      widthM: 3,
      heightM: 2.7,
      heatedFloor: false,
    },
  ],
  lines: [
    {
      id: 'l1',
      section: 'MATERIALS',
      status: 'OK',
      roomClientId: 'r1',
      categoryId: 'c1',
      productId: 'p1',
      optionId: null,
      packageItemId: null,
      ruleId: null,
      quantity: 12,
      unit: 'SQM',
      unitPriceCents: 1000,
      amountCents: 12000,
      amountUahKopecks: null,
      warnings: [],
      error: null,
      roomName: name('Bedroom'),
      categoryName: name('Floor'),
      product: {
        name: name('Laminate'),
        brand: 'Brand',
        manufacturer: 'Maker',
        color: name('Oak'),
        size: name('120x20'),
        image: { id: 'i1', publicId: 'roomwise/laminate' },
      },
      optionName: null,
      packageItemName: null,
      ruleName: null,
    },
  ],
  estimate: {
    totals: {
      usdCents: 12000,
      uahKopecks: null,
      sections: Object.fromEntries(
        ['BASE', 'OBJECT', 'MATERIALS', 'ENGINEERING', 'ADDITIONAL'].map(
          (section) => [section, { usdCents: 0, uahKopecks: null }],
        ),
      ),
    },
    warnings: [],
    incomplete: false,
    currency: 'USD',
  },
  pricing: {
    exchangeRate: null,
    baseRate: null,
    coefficients: { waste: 1.1 },
    rules: [
      {
        id: 'ru1',
        level: 'OBJECT',
        categoryId: null,
        materialTypeId: null,
        quantityFormula: null,
        costFormula: 'area * 2',
      },
    ],
  },
});

describe('SnapshotV1Schema', () => {
  it('parses a full snapshot', () => {
    const result = SnapshotV1Schema.safeParse(buildSnapshot());

    expect(result.success).toBe(true);
  });

  it('rejects a different schema version', () => {
    const result = SnapshotV1Schema.safeParse({
      ...buildSnapshot(),
      schemaVersion: 2,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a line without enrichment fields', () => {
    const snapshot = buildSnapshot();
    const { roomName: _roomName, ...line } = snapshot.lines[0];

    const result = SnapshotV1Schema.safeParse({
      ...snapshot,
      lines: [line],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a product without an image', () => {
    const snapshot = buildSnapshot();
    snapshot.lines[0].product = { ...snapshot.lines[0].product!, image: null };

    const result = SnapshotV1Schema.safeParse(snapshot);

    expect(result.success).toBe(true);
  });
});
