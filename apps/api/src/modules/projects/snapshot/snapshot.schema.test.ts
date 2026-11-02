import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type Snapshot,
  SnapshotSchema,
} from './snapshot.schema';

const name = (en: string) => ({ en, uk: `${en}-uk` });

const emptySection = { usdCents: 0, uahKopecks: null };

const buildSnapshot = (): Snapshot => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  createdAt: '2026-10-22T10:00:00.000Z',
  pricingVersion: 'v1',
  configuration: {
    scope: 'FULL',
    finishLevel: 'ROUGH',
    totalAreaSqm: 50,
    balconyAreaSqm: 0,
    balconyTiles: false,
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
      sections: {
        BASE: emptySection,
        OBJECT: emptySection,
        MATERIALS: emptySection,
        ENGINEERING: emptySection,
        ADDITIONAL: emptySection,
      },
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

describe('SnapshotSchema', () => {
  it('parses a full snapshot', () => {
    const result = SnapshotSchema.safeParse(buildSnapshot());

    expect(result.success).toBe(true);
  });

  it('rejects an unknown schema version', () => {
    const result = SnapshotSchema.safeParse({
      ...buildSnapshot(),
      schemaVersion: 3,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a line without enrichment fields', () => {
    const snapshot = buildSnapshot();
    const { roomName: _roomName, ...line } = snapshot.lines[0];

    const result = SnapshotSchema.safeParse({
      ...snapshot,
      lines: [line],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a product without an image', () => {
    const snapshot = buildSnapshot();
    snapshot.lines[0].product = { ...snapshot.lines[0].product!, image: null };

    const result = SnapshotSchema.safeParse(snapshot);

    expect(result.success).toBe(true);
  });

  it('accepts a stored snapshot whose configuration still has gas', () => {
    const snapshot = buildSnapshot();

    const result = SnapshotSchema.safeParse({
      ...snapshot,
      configuration: { ...snapshot.configuration, gas: true },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a stored snapshot whose configuration still has kitchenType', () => {
    const snapshot = buildSnapshot();

    const result = SnapshotSchema.safeParse({
      ...snapshot,
      configuration: { ...snapshot.configuration, kitchenType: 'SEPARATE' },
    });

    expect(result.success).toBe(true);
  });
});

describe('SnapshotSchema with a stored v1 snapshot', () => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'snapshot-v1.json'), 'utf8'),
  );
  const parsed = SnapshotSchema.parse(raw);

  it('reads it as a full-scope snapshot', () => {
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.configuration.scope).toBe('FULL');
  });

  it('keeps totals and line amounts unchanged', () => {
    expect(parsed.estimate.totals).toEqual(raw.estimate.totals);
    expect(parsed.lines.map((line) => line.amountCents)).toEqual(
      raw.lines.map((line: { amountCents: number }) => line.amountCents),
    );
  });

  it('keeps the style and the base rate', () => {
    expect(parsed.style).toEqual(raw.style);
    expect(parsed.style).not.toBeNull();
    expect(parsed.pricing.baseRate).toEqual(raw.pricing.baseRate);
  });
});
