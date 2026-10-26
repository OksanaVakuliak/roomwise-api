import type {
  Configuration,
  Estimate,
  EstimateLine,
  PricingData,
} from '@roomwise/calc-engine';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type {
  CatalogSnapshotData,
  CatalogSnapshotReadService,
} from '../../catalog/snapshot-read/catalog-snapshot-read.service';
import type { PricingEstimateService } from '../../pricing/estimate/pricing-estimate.service';
import { SnapshotBuilder } from './snapshot.builder';
import { type SnapshotV1, SnapshotV1Schema } from './snapshot.schema';

const text = (value: string) => ({ en: value, uk: `${value} uk` });
const createdAt = new Date('2026-10-20T12:00:00.000Z');

const configuration: Configuration = {
  finishLevel: 'ROUGH',
  totalAreaSqm: 50,
  balconyAreaSqm: 0,
  balconyTiles: false,
  gas: false,
  kitchenType: 'SEPARATE',
  rooms: [
    {
      clientId: 'room-a',
      roomTypeCode: 'KITCHEN',
      lengthM: 4,
      widthM: 3,
      heightM: 2.7,
      heatedFloor: false,
      selections: [{ categoryId: 'category-1', productId: 'product-1' }],
    },
  ],
  options: [],
  currency: 'USD',
};

function line(overrides: Partial<EstimateLine>): EstimateLine {
  return {
    id: 'line',
    section: 'MATERIALS',
    status: 'OK',
    roomClientId: null,
    categoryId: null,
    productId: null,
    optionId: null,
    packageItemId: null,
    ruleId: null,
    quantity: null,
    unit: null,
    unitPriceCents: null,
    amountCents: 100,
    amountUahKopecks: null,
    warnings: [],
    error: null,
    ...overrides,
  };
}

const estimate: Estimate = {
  pricingVersion: '0123456789abcdef',
  currency: 'USD',
  exchangeRate: { rate: '41.2000', date: '2026-10-20', source: 'NBU' },
  lines: [
    line({ id: 'base', section: 'BASE' }),
    line({
      id: 'material',
      roomClientId: 'room-a',
      categoryId: 'category-1',
      productId: 'product-1',
      ruleId: 'rule-1',
    }),
    line({
      id: 'engineering',
      section: 'ENGINEERING',
      optionId: 'option-1',
      packageItemId: 'item-1',
    }),
    line({ id: 'unknown', productId: 'product-gone', ruleId: 'rule-gone' }),
  ],
  totals: {
    usdCents: 400,
    uahKopecks: null,
    sections: {
      BASE: { usdCents: 100, uahKopecks: null },
      OBJECT: { usdCents: 0, uahKopecks: null },
      MATERIALS: { usdCents: 200, uahKopecks: null },
      ENGINEERING: { usdCents: 100, uahKopecks: null },
      ADDITIONAL: { usdCents: 0, uahKopecks: null },
    },
  },
  warnings: [{ code: 'WARN', lineId: 'material' }],
  incomplete: false,
};

function rule(id: string, costFormula: string) {
  return {
    id,
    level: 'CATEGORY' as const,
    categoryId: 'category-1',
    materialTypeId: null,
    name: text(id),
    quantityFormula: 'area',
    costFormula,
    sortOrder: 0,
  };
}

function pricingData(overrides: Partial<PricingData> = {}): PricingData {
  return {
    version: '0123456789abcdef',
    exchangeRate: estimate.exchangeRate,
    limits: {} as PricingData['limits'],
    baseRates: [
      {
        finishLevel: 'ROUGH',
        areaFromSqm: 0,
        areaToSqm: 50,
        rateCentsPerSqm: 1000,
      },
      {
        finishLevel: 'ROUGH',
        areaFromSqm: 50,
        areaToSqm: 100,
        rateCentsPerSqm: 2000,
      },
      {
        finishLevel: 'PRE_FINISH',
        areaFromSqm: 0,
        areaToSqm: 100,
        rateCentsPerSqm: 3000,
      },
    ],
    coefficients: { k: 1.5 },
    rules: [rule('rule-1', 'qty * 2'), rule('rule-unused', 'qty * 3')],
    roomTypes: [
      { id: 'room-type-kitchen', code: 'KITCHEN' },
      { id: 'room-type-bedroom', code: 'BEDROOM' },
    ],
    categories: [],
    materialTypes: [],
    products: [],
    packageItems: [],
    options: [],
    ...overrides,
  };
}

function catalogData(
  overrides: Partial<CatalogSnapshotData> = {},
): CatalogSnapshotData {
  return {
    products: new Map([
      [
        'product-1',
        {
          id: 'product-1',
          name: text('Tile'),
          brand: 'Brand',
          manufacturer: 'Maker',
          color: text('White'),
          size: text('60x60'),
          image: { id: 'image-1', publicId: 'a/b' },
        },
      ],
    ]),
    categories: new Map([
      ['category-1', { id: 'category-1', name: text('Floor') }],
    ]),
    roomTypes: new Map([
      [
        'room-type-kitchen',
        { id: 'room-type-kitchen', code: 'KITCHEN', name: text('Kitchen') },
      ],
    ]),
    options: new Map([['option-1', { id: 'option-1', name: text('Option') }]]),
    packageItems: new Map([['item-1', { id: 'item-1', name: text('Item') }]]),
    style: { id: 'style-1', name: text('Modern'), published: true },
    ...overrides,
  };
}

function createBuilder(
  options: { pricing?: PricingData; catalog?: CatalogSnapshotData } = {},
) {
  const pricingEstimate = {
    estimate: vi.fn().mockResolvedValue({
      estimate,
      pricingData: options.pricing ?? pricingData(),
    }),
  };
  const catalog = {
    read: vi.fn().mockResolvedValue(options.catalog ?? catalogData()),
  };
  const builder = new SnapshotBuilder(
    pricingEstimate as unknown as PricingEstimateService,
    catalog as unknown as CatalogSnapshotReadService,
  );
  return { builder, pricingEstimate, catalog };
}

const input = { configuration, styleId: 'style-1', createdAt };

describe('SnapshotBuilder', () => {
  it('passes the missing references policy to the estimate', async () => {
    const { builder, pricingEstimate } = createBuilder();

    const { builder: source } = createBuilder();
    const previous = await source.build(input);

    await builder.build({
      ...input,
      missingReferences: 'unavailable',
      previous,
    });

    expect(pricingEstimate.estimate).toHaveBeenCalledWith(configuration, {
      missingReferences: 'unavailable',
      retiredOptions: [{ id: 'option-1', kind: 'ENGINEERING' }],
    });
  });

  it('builds a valid snapshot with enriched names', async () => {
    const { builder, pricingEstimate, catalog } = createBuilder();

    const snapshot = await builder.build(input);

    expect(pricingEstimate.estimate).toHaveBeenCalledWith(configuration, {
      missingReferences: undefined,
      retiredOptions: undefined,
    });
    expect(catalog.read).toHaveBeenCalledWith({
      productIds: ['product-1', 'product-gone'],
      categoryIds: ['category-1'],
      roomTypeIds: ['room-type-kitchen'],
      optionIds: ['option-1'],
      packageItemIds: ['item-1'],
      styleId: 'style-1',
    });
    expect(() => SnapshotV1Schema.parse(snapshot)).not.toThrow();
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      createdAt: '2026-10-20T12:00:00.000Z',
      pricingVersion: '0123456789abcdef',
      configuration,
      style: { id: 'style-1', name: text('Modern') },
      estimate: {
        totals: estimate.totals,
        warnings: estimate.warnings,
        incomplete: false,
        currency: 'USD',
      },
    });
    expect(snapshot.rooms).toEqual([
      {
        clientId: 'room-a',
        roomTypeCode: 'KITCHEN',
        lengthM: 4,
        widthM: 3,
        heightM: 2.7,
        heatedFloor: false,
        roomTypeName: text('Kitchen'),
      },
    ]);
    expect(snapshot.lines[1]).toMatchObject({
      roomName: text('Kitchen'),
      categoryName: text('Floor'),
      ruleName: text('rule-1'),
      optionName: null,
      packageItemName: null,
      product: {
        name: text('Tile'),
        brand: 'Brand',
        manufacturer: 'Maker',
        color: text('White'),
        size: text('60x60'),
        image: { id: 'image-1', publicId: 'a/b' },
      },
    });
    expect(snapshot.lines[2]).toMatchObject({
      optionName: text('Option'),
      packageItemName: text('Item'),
      roomName: null,
      product: null,
    });
  });

  it('leaves names null for null ids and entities missing from the catalog', async () => {
    const { builder } = createBuilder();

    const snapshot = await builder.build(input);

    expect(snapshot.lines[0]).toMatchObject({
      roomName: null,
      categoryName: null,
      product: null,
      optionName: null,
      packageItemName: null,
      ruleName: null,
    });
    expect(snapshot.lines[3]).toMatchObject({ product: null, ruleName: null });
  });

  it('keeps only the rules used by lines and exposes coefficients and rate', async () => {
    const { builder } = createBuilder();

    const snapshot = await builder.build(input);

    expect(snapshot.pricing.rules).toEqual([
      {
        id: 'rule-1',
        level: 'CATEGORY',
        categoryId: 'category-1',
        materialTypeId: null,
        quantityFormula: 'area',
        costFormula: 'qty * 2',
      },
    ]);
    expect(snapshot.pricing.coefficients).toEqual({ k: 1.5 });
    expect(snapshot.pricing.exchangeRate).toEqual(estimate.exchangeRate);
  });

  it('picks the base rate for the area and finish level', async () => {
    const { builder } = createBuilder();

    const inside = await builder.build({
      ...input,
      configuration: { ...configuration, totalAreaSqm: 49.99 },
    });
    const boundary = await builder.build(input);
    const preFinish = await builder.build({
      ...input,
      configuration: { ...configuration, finishLevel: 'PRE_FINISH' },
    });

    expect(inside.pricing.baseRate?.rateCentsPerSqm).toBe(1000);
    expect(boundary.pricing.baseRate?.rateCentsPerSqm).toBe(2000);
    expect(preFinish.pricing.baseRate?.rateCentsPerSqm).toBe(3000);
  });

  it('sets the base rate to null when no range matches', async () => {
    const { builder } = createBuilder({
      pricing: pricingData({
        baseRates: [
          {
            finishLevel: 'ROUGH',
            areaFromSqm: 0,
            areaToSqm: 50,
            rateCentsPerSqm: 1000,
          },
        ],
      }),
    });

    const snapshot = await builder.build(input);

    expect(snapshot.pricing.baseRate).toBeNull();
  });

  it.each([
    ['missing', null],
    ['unpublished', { id: 'style-1', name: text('Modern'), published: false }],
  ])('rejects a %s style', async (_label, style) => {
    const { builder } = createBuilder({ catalog: catalogData({ style }) });

    const error = await builder.build(input).catch((caught) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ERROR_CODES.STYLE_NOT_FOUND);
  });

  describe('with a stored style', () => {
    const previous = {
      lines: [],
      style: { id: 'style-1', name: text('Stored') },
    } as unknown as SnapshotV1;

    it('keeps an unpublished style', async () => {
      const { builder } = createBuilder({
        catalog: catalogData({
          style: { id: 'style-1', name: text('Modern'), published: false },
        }),
      });

      const snapshot = await builder.build({ ...input, previous });

      expect(snapshot.style).toEqual({ id: 'style-1', name: text('Modern') });
    });

    it('falls back to the stored style when the row is gone', async () => {
      const { builder } = createBuilder({
        catalog: catalogData({ style: null }),
      });

      const snapshot = await builder.build({ ...input, previous });

      expect(snapshot.style).toEqual(previous.style);
    });
  });

  describe('names of deleted catalog entries', () => {
    const emptyCatalog = () =>
      catalogData({
        products: new Map(),
        categories: new Map(),
        options: new Map(),
        packageItems: new Map(),
      });

    it('takes them from the previous snapshot', async () => {
      const { builder: source } = createBuilder();
      const previous = await source.build(input);
      const { builder } = createBuilder({ catalog: emptyCatalog() });

      const snapshot = await builder.build({ ...input, previous });
      const byId = (id: string) =>
        snapshot.lines.find((candidate) => candidate.id === id);

      expect(byId('material')).toMatchObject({
        categoryName: text('Floor'),
        product: { name: text('Tile'), brand: 'Brand' },
      });
      expect(byId('engineering')).toMatchObject({
        optionName: text('Option'),
        packageItemName: text('Item'),
      });
    });

    it('leaves them empty without a previous snapshot', async () => {
      const { builder } = createBuilder({ catalog: emptyCatalog() });

      const snapshot = await builder.build(input);
      const material = snapshot.lines.find(
        (candidate) => candidate.id === 'material',
      );

      expect(material).toMatchObject({ categoryName: null, product: null });
    });

    it('prefers the current catalog over the previous snapshot', async () => {
      const { builder: source } = createBuilder({
        catalog: catalogData({
          categories: new Map([
            ['category-1', { id: 'category-1', name: text('Old floor') }],
          ]),
        }),
      });
      const previous = await source.build(input);
      const { builder } = createBuilder();

      const snapshot = await builder.build({ ...input, previous });
      const material = snapshot.lines.find(
        (candidate) => candidate.id === 'material',
      );

      expect(material?.categoryName).toEqual(text('Floor'));
    });
  });

  it('throws a plain error when a room type is missing from the catalog', async () => {
    const { builder } = createBuilder({
      catalog: catalogData({ roomTypes: new Map() }),
    });

    await expect(builder.build(input)).rejects.toThrow(
      'Room type KITCHEN is missing',
    );
  });

  it('propagates estimate errors', async () => {
    const { builder, pricingEstimate } = createBuilder();
    pricingEstimate.estimate.mockRejectedValue(
      new AppError(ERROR_CODES.UNKNOWN_REFERENCE),
    );

    await expect(builder.build(input)).rejects.toBeInstanceOf(AppError);
  });
});
