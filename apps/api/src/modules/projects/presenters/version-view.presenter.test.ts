import { describe, expect, it } from 'vitest';
import type { CatalogSnapshotReadService } from '../../catalog/snapshot-read/catalog-snapshot-read.service';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotV1,
} from '../snapshot/snapshot.schema';
import {
  type PresentVersionInput,
  VersionViewPresenter,
} from './version-view.presenter';
import { versionViewSchema } from './version-view.schema';

const IMAGE_ID = '3f1c9a52-8d0e-4f7a-9b61-2c5d7e8a1b34';

const name = (en: string) => ({ en, uk: `${en}-uk` });

const emptySection = { usdCents: 0, uahKopecks: null };

const buildSnapshot = (): SnapshotV1 => ({
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
        image: { id: IMAGE_ID, publicId: 'roomwise/laminate' },
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
    coefficients: {},
    rules: [],
  },
});

const catalog = {
  imageRef: ({ id, publicId }: { id: string; publicId: string }) => ({
    id,
    thumb: `https://img.test/thumb/${publicId}`,
    card: `https://img.test/card/${publicId}`,
    zoom: `https://img.test/zoom/${publicId}`,
  }),
} as unknown as CatalogSnapshotReadService;

const presenter = new VersionViewPresenter(catalog);

const NOW = new Date('2026-10-23T12:00:00.000Z');

const buildInput = (
  overrides: Partial<PresentVersionInput> = {},
): PresentVersionInput => ({
  publicId: 'abc',
  version: {
    number: 2,
    snapshot: buildSnapshot(),
    pricingVersion: 'v1',
    incomplete: false,
    expiresAt: new Date('2026-11-01T00:00:00.000Z'),
    createdAt: new Date('2026-10-22T10:00:00.000Z'),
  },
  versions: [],
  priceStatus: null,
  lang: 'en',
  now: NOW,
  ...overrides,
});

describe('VersionViewPresenter', () => {
  it('localizes texts to the requested language', () => {
    const uk = presenter.present(buildInput({ lang: 'uk' }));
    const en = presenter.present(buildInput({ lang: 'en' }));

    expect(uk.style?.name).toBe('Modern-uk');
    expect(uk.rooms[0].name).toBe('Bedroom-uk');
    expect(uk.lines[0].roomName).toBe('Bedroom-uk');
    expect(uk.lines[0].categoryName).toBe('Floor-uk');
    expect(uk.lines[0].product?.name).toBe('Laminate-uk');
    expect(uk.lines[0].product?.color).toBe('Oak-uk');
    expect(en.style?.name).toBe('Modern');
    expect(en.rooms[0].name).toBe('Bedroom');
    expect(en.lines[0].product?.size).toBe('120x20');
    expect(en.lines[0].optionName).toBeNull();
  });

  it('maps the product image to an image reference', () => {
    const view = presenter.present(buildInput());

    expect(view.lines[0].product?.image).toEqual({
      id: IMAGE_ID,
      thumb: 'https://img.test/thumb/roomwise/laminate',
      card: 'https://img.test/card/roomwise/laminate',
      zoom: 'https://img.test/zoom/roomwise/laminate',
    });
  });

  it('keeps a missing image, product and style as null', () => {
    const snapshot = buildSnapshot();
    snapshot.lines[0].product = { ...snapshot.lines[0].product!, image: null };
    snapshot.lines.push({ ...snapshot.lines[0], id: 'l2', product: null });
    snapshot.style = null;

    const view = presenter.present(
      buildInput({ version: { ...buildInput().version, snapshot } }),
    );

    expect(view.lines[0].product?.image).toBeNull();
    expect(view.lines[1].product).toBeNull();
    expect(view.style).toBeNull();
  });

  it('marks a version expired exactly at its expiry time', () => {
    const expiredAt = (expiresAt: Date) =>
      presenter.present(
        buildInput({ version: { ...buildInput().version, expiresAt } }),
      ).expired;

    expect(expiredAt(new Date(NOW.getTime() + 1))).toBe(false);
    expect(expiredAt(NOW)).toBe(true);
    expect(expiredAt(new Date(NOW.getTime() - 1))).toBe(true);
  });

  it('lists versions newest first with their own expiry flags', () => {
    const view = presenter.present(
      buildInput({
        versions: [
          {
            number: 1,
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            totalUsdCents: 100,
            expiresAt: NOW,
          },
          {
            number: 3,
            createdAt: new Date('2026-10-22T00:00:00.000Z'),
            totalUsdCents: 300,
            expiresAt: new Date(NOW.getTime() + 1),
          },
          {
            number: 2,
            createdAt: new Date('2026-10-10T00:00:00.000Z'),
            totalUsdCents: 200,
            expiresAt: new Date(NOW.getTime() - 1),
          },
        ],
      }),
    );

    expect(view.versions.map((item) => item.number)).toEqual([3, 2, 1]);
    expect(view.versions.map((item) => item.expired)).toEqual([
      false,
      true,
      true,
    ]);
    expect(view.versions[0].createdAt).toBe('2026-10-22T00:00:00.000Z');
  });

  it('takes totals, warnings and exchange rate from the snapshot', () => {
    const snapshot = buildSnapshot();
    snapshot.pricing.exchangeRate = {
      rate: '44.5483',
      date: '2026-10-22',
      source: 'NBU',
    };

    const view = presenter.present(
      buildInput({ version: { ...buildInput().version, snapshot } }),
    );

    expect(view.totals).toEqual(snapshot.estimate.totals);
    expect(view.warnings).toEqual([]);
    expect(view.exchangeRate).toEqual(snapshot.pricing.exchangeRate);
  });

  it('produces output that satisfies the view schema', () => {
    const view = presenter.present(
      buildInput({
        versions: [
          {
            number: 1,
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            totalUsdCents: 100,
            expiresAt: NOW,
          },
        ],
      }),
    );

    expect(versionViewSchema.safeParse(view).success).toBe(true);
  });
});
