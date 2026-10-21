import { PricingDataSchema } from '@roomwise/calc-engine';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  FinishLevel,
  RuleLevel,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import type { CatalogChangeNotifier } from '../../catalog/common/catalog-change.notifier';
import type { CatalogPricingReadService } from '../../catalog/pricing-read/catalog-pricing-read.service';
import type { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { PricingDataService } from './pricing-data.service';

const CATEGORY_ID = 'a02f1429-4d77-49eb-a43d-52dcb2426d9f';
const MATERIAL_TYPE_ID = '9b0a1160-0ea9-4b10-b0d2-4e32eec1945a';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    level: RuleLevel.CATEGORY,
    categoryId: CATEGORY_ID,
    materialTypeId: null,
    name: { en: 'Rule', uk: 'Правило' },
    quantityFormula: 'floorArea',
    costFormula: 'quantity * price',
    coefficientKeys: [],
    sortOrder: 0,
    ...overrides,
  };
}

interface Fixture {
  rules?: unknown[];
  settings?: unknown;
  activeRate?: unknown;
}

function createService(fixture: Fixture = {}) {
  const settings =
    fixture.settings === undefined
      ? {
          id: 1,
          totalAreaMinSqm: decimal('15.00'),
          totalAreaMaxSqm: decimal('500.00'),
          roomsMin: 1,
          roomsMax: 15,
          roomSideMinM: decimal('1.00'),
          roomSideMaxM: decimal('30.00'),
          roomHeightMinM: decimal('2.20'),
          roomHeightMaxM: decimal('5.00'),
        }
      : fixture.settings;

  const prisma = {
    pricingSettings: { findUnique: vi.fn().mockResolvedValue(settings) },
    baseRate: {
      findMany: vi.fn().mockResolvedValue([
        {
          finishLevel: FinishLevel.ROUGH,
          areaFromSqm: decimal('15.00'),
          areaToSqm: decimal('500.01'),
          rateCentsPerSqm: 9500,
        },
      ]),
    },
    coefficient: {
      findMany: vi.fn().mockResolvedValue([
        { key: 'tile_glue', value: decimal('10.0000') },
        { key: 'laminate_underlay', value: decimal('2.0000') },
      ]),
    },
    pricingRule: {
      findMany: vi.fn().mockResolvedValue(fixture.rules ?? [ruleRow()]),
    },
  };

  const catalog = {
    roomTypes: vi.fn().mockResolvedValue([{ id: 'room-1', code: 'BEDROOM' }]),
    categories: vi
      .fn()
      .mockResolvedValue([
        { id: CATEGORY_ID, wastePercent: 10, surface: SurfaceKind.FLOOR },
      ]),
    materialTypes: vi
      .fn()
      .mockResolvedValue([{ id: MATERIAL_TYPE_ID, code: 'laminate' }]),
    products: vi.fn().mockResolvedValue([]),
    packageItems: vi.fn().mockResolvedValue([]),
    options: vi.fn().mockResolvedValue([]),
  };

  const changes = new Subject<void>();
  const notifier = { changes$: changes.asObservable() };
  const rateChanges = new Subject<void>();
  const exchangeRates = {
    changes$: rateChanges.asObservable(),
    activeRate: vi.fn().mockResolvedValue(fixture.activeRate ?? null),
    requestRefreshIfStale: vi.fn(),
  };
  const service = new PricingDataService(
    prisma as unknown as PrismaService,
    catalog as unknown as CatalogPricingReadService,
    notifier as unknown as CatalogChangeNotifier,
    exchangeRates as unknown as ExchangeRateService,
  );

  return { service, prisma, catalog, changes, exchangeRates, rateChanges };
}

describe('PricingDataService', () => {
  it('assembles pricing data that satisfies the package schema', async () => {
    const { service } = createService();

    const data = await service.get();

    expect(PricingDataSchema.safeParse(data).success).toBe(true);
    expect(data.limits).toEqual({
      totalAreaSqm: { min: 15, max: 500 },
      rooms: { min: 1, max: 15 },
      roomSideM: { min: 1, max: 30 },
      roomHeightM: { min: 2.2, max: 5 },
    });
    expect(data.baseRates).toEqual([
      {
        finishLevel: FinishLevel.ROUGH,
        areaFromSqm: 15,
        areaToSqm: 500.01,
        rateCentsPerSqm: 9500,
      },
    ]);
    expect(data.coefficients).toEqual({ tile_glue: 10, laminate_underlay: 2 });
    expect(data.categories).toEqual([
      { id: CATEGORY_ID, wastePercent: 10, surface: SurfaceKind.FLOOR },
    ]);
  });

  it('derives the version from the content, not from row order', async () => {
    const first = await createService().service.get();
    const second = await createService().service.get();
    const changed = await createService({
      rules: [ruleRow({ costFormula: 'quantity * price * 2' })],
    }).service.get();

    expect(first.version).toMatch(/^[0-9a-f]{16}$/);
    expect(second.version).toBe(first.version);
    expect(changed.version).not.toBe(first.version);
  });

  it('excludes rules that point to a missing category or material type', async () => {
    const kept = ruleRow({
      id: '22222222-2222-4222-8222-222222222222',
      level: RuleLevel.MATERIAL_TYPE,
      materialTypeId: MATERIAL_TYPE_ID,
    });
    const object = ruleRow({
      id: '33333333-3333-4333-8333-333333333333',
      level: RuleLevel.OBJECT,
      categoryId: null,
      quantityFormula: null,
    });
    const { service } = createService({
      rules: [
        ruleRow({
          id: '44444444-4444-4444-8444-444444444444',
          categoryId: UNKNOWN_ID,
        }),
        kept,
        ruleRow({
          id: '55555555-5555-4555-8555-555555555555',
          level: RuleLevel.MATERIAL_TYPE,
          materialTypeId: UNKNOWN_ID,
        }),
        object,
      ],
    });

    const data = await service.get();

    expect(data.rules.map((rule) => rule.id)).toEqual([object.id, kept.id]);
  });

  it('excludes rules whose quantity formula does not match their level', async () => {
    const kept = ruleRow({ id: '66666666-6666-4666-8666-666666666666' });
    const { service } = createService({
      rules: [
        kept,
        ruleRow({
          id: '77777777-7777-4777-8777-777777777777',
          quantityFormula: null,
        }),
        ruleRow({
          id: '88888888-8888-4888-8888-888888888888',
          level: RuleLevel.OBJECT,
          categoryId: null,
        }),
      ],
    });

    const data = await service.get();

    expect(data.rules.map((rule) => rule.id)).toEqual([kept.id]);
  });

  it('orders rules by level, sort order and id', async () => {
    const { service } = createService({
      rules: [
        ruleRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        ruleRow({
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          level: RuleLevel.OBJECT,
          categoryId: null,
          quantityFormula: null,
          sortOrder: 1,
        }),
        ruleRow({
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          level: RuleLevel.OBJECT,
          categoryId: null,
          quantityFormula: null,
          sortOrder: 0,
        }),
        ruleRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      ],
    });

    const data = await service.get();

    expect(data.rules.map((rule) => rule.id[0])).toEqual(['d', 'c', 'a', 'b']);
  });

  describe('exchange rate', () => {
    it('is null when there is no active rate', async () => {
      const data = await createService().service.get();

      expect(data.exchangeRate).toBeNull();
    });

    it('takes the active rate from the exchange rate service', async () => {
      const activeRate = {
        rate: '42.0000',
        date: '2026-10-17',
        source: 'MANUAL',
      };
      const { service } = createService({ activeRate });

      const data = await service.get();

      expect(data.exchangeRate).toEqual(activeRate);
    });

    it('asks for a background refresh on every read without awaiting it', async () => {
      const { service, exchangeRates } = createService();

      await service.get();
      await service.get();

      expect(exchangeRates.requestRefreshIfStale).toHaveBeenCalledTimes(2);
    });

    it('rebuilds after the effective rate changes', async () => {
      const { service, exchangeRates, rateChanges } = createService();
      service.onModuleInit();

      await service.get();
      rateChanges.next();
      await service.get();

      expect(exchangeRates.activeRate).toHaveBeenCalledTimes(2);
    });
  });

  it('fails when pricing settings are not seeded', async () => {
    const { service } = createService({ settings: null });

    await expect(service.get()).rejects.toThrow('Pricing settings are missing');
  });

  describe('cache', () => {
    it('builds once for repeated and concurrent reads', async () => {
      const { service, prisma } = createService();

      const [first, second] = await Promise.all([service.get(), service.get()]);
      const third = await service.get();

      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(prisma.pricingRule.findMany).toHaveBeenCalledTimes(1);
    });

    it('rebuilds after invalidate', async () => {
      const { service, prisma } = createService();
      await service.get();

      service.invalidate();
      await service.get();

      expect(prisma.pricingRule.findMany).toHaveBeenCalledTimes(2);
    });

    it('rebuilds after a catalog change event', async () => {
      const { service, prisma, changes } = createService();
      service.onModuleInit();
      await service.get();

      changes.next();
      await service.get();

      expect(prisma.pricingRule.findMany).toHaveBeenCalledTimes(2);
    });

    it('stops listening to catalog changes on destroy', async () => {
      const { service, prisma, changes } = createService();
      service.onModuleInit();
      service.onModuleDestroy();
      await service.get();

      changes.next();
      await service.get();

      expect(prisma.pricingRule.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not cache a build that was invalidated while running', async () => {
      const { service, prisma } = createService();
      const stale = service.get();

      service.invalidate();
      await stale;
      await service.get();

      expect(prisma.pricingRule.findMany).toHaveBeenCalledTimes(2);
    });

    it('retries after a failed build', async () => {
      const { service, prisma } = createService();
      prisma.pricingRule.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.get()).rejects.toThrow('db down');
      await expect(service.get()).resolves.toBeDefined();
    });
  });
});
