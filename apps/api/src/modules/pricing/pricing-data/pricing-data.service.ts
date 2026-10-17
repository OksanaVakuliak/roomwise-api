import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  type BaseRate,
  type ExchangeRate,
  type PricingData,
  PricingDataSchema,
  type PricingLimits,
  type PricingRule,
} from '@roomwise/calc-engine';
import type { Subscription } from 'rxjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { RateSource } from '../../../generated/prisma/enums';
import { CatalogChangeNotifier } from '../../catalog/common/catalog-change.notifier';
import { CatalogPricingReadService } from '../../catalog/pricing-read/catalog-pricing-read.service';
import { canonicalHash } from './canonical-hash';

const SETTINGS_ID = 1;
const RATE_FRACTION_DIGITS = 4;
const ISO_DATE_LENGTH = 10;
const RULE_LEVEL_ORDER = { OBJECT: 0, CATEGORY: 1, MATERIAL_TYPE: 2 } as const;

type PricingDataBody = Omit<PricingData, 'version'>;
type SettingsRow = Prisma.PricingSettingsGetPayload<{
  include: { manualRate: true };
}>;
type ExchangeRateRow = Prisma.ExchangeRateGetPayload<object>;

function toLimits(settings: SettingsRow): PricingLimits {
  return {
    totalAreaSqm: {
      min: settings.totalAreaMinSqm.toNumber(),
      max: settings.totalAreaMaxSqm.toNumber(),
    },
    rooms: { min: settings.roomsMin, max: settings.roomsMax },
    roomSideM: {
      min: settings.roomSideMinM.toNumber(),
      max: settings.roomSideMaxM.toNumber(),
    },
    roomHeightM: {
      min: settings.roomHeightMinM.toNumber(),
      max: settings.roomHeightMaxM.toNumber(),
    },
  };
}

function toExchangeRate(row: ExchangeRateRow | null): ExchangeRate | null {
  if (!row) {
    return null;
  }

  return {
    rate: row.rate.toFixed(RATE_FRACTION_DIGITS),
    date: row.effectiveDate.toISOString().slice(0, ISO_DATE_LENGTH),
    source: row.source,
  };
}

@Injectable()
export class PricingDataService implements OnModuleInit, OnModuleDestroy {
  private cached: PricingData | null = null;
  private pending: Promise<PricingData> | null = null;
  private generation = 0;
  private subscription: Subscription | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogPricingReadService)
    private readonly catalog: CatalogPricingReadService,
    @Inject(CatalogChangeNotifier)
    private readonly catalogChanges: CatalogChangeNotifier,
  ) {}

  onModuleInit(): void {
    this.subscription = this.catalogChanges.changes$.subscribe(() =>
      this.invalidate(),
    );
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  invalidate(): void {
    this.generation += 1;
    this.cached = null;
    this.pending = null;
  }

  async get(): Promise<PricingData> {
    if (this.cached) {
      return this.cached;
    }

    if (!this.pending) {
      const generation = this.generation;
      const pending = this.build().then((data) => {
        if (generation === this.generation) {
          this.cached = data;
          this.pending = null;
        }
        return data;
      });
      pending.catch(() => {
        if (this.pending === pending) {
          this.pending = null;
        }
      });
      this.pending = pending;
    }

    return this.pending;
  }

  private async build(): Promise<PricingData> {
    const [
      roomTypes,
      categories,
      materialTypes,
      products,
      packageItems,
      options,
      settings,
      baseRates,
      coefficients,
      ruleRows,
      nbuRate,
    ] = await Promise.all([
      this.catalog.roomTypes(),
      this.catalog.categories(),
      this.catalog.materialTypes(),
      this.catalog.products(),
      this.catalog.packageItems(),
      this.catalog.options(),
      this.readSettings(),
      this.readBaseRates(),
      this.readCoefficients(),
      this.readRules(),
      this.prisma.exchangeRate.findFirst({
        where: { source: RateSource.NBU },
        orderBy: { effectiveDate: 'desc' },
      }),
    ]);
    const limits = toLimits(settings);
    const exchangeRate = toExchangeRate(settings.manualRate ?? nbuRate);

    const categoryIds = new Set(categories.map((category) => category.id));
    const materialTypeIds = new Set(
      materialTypes.map((materialType) => materialType.id),
    );
    const rules = ruleRows.filter(
      (rule) =>
        (rule.categoryId === null || categoryIds.has(rule.categoryId)) &&
        (rule.materialTypeId === null ||
          materialTypeIds.has(rule.materialTypeId)) &&
        (rule.level === 'OBJECT') === (rule.quantityFormula === null),
    );

    const body: PricingDataBody = {
      exchangeRate,
      limits,
      baseRates,
      coefficients,
      rules,
      roomTypes,
      categories,
      materialTypes,
      products,
      packageItems,
      options,
    };

    return PricingDataSchema.parse({ ...body, version: canonicalHash(body) });
  }

  private async readSettings(): Promise<SettingsRow> {
    const settings = await this.prisma.pricingSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: { manualRate: true },
    });

    if (!settings) {
      throw new Error('Pricing settings are missing; run the seed.');
    }

    return settings;
  }

  private async readBaseRates(): Promise<BaseRate[]> {
    const rows = await this.prisma.baseRate.findMany({
      orderBy: [{ finishLevel: 'asc' }, { areaFromSqm: 'asc' }],
    });

    return rows.map((row) => ({
      finishLevel: row.finishLevel,
      areaFromSqm: row.areaFromSqm.toNumber(),
      areaToSqm: row.areaToSqm.toNumber(),
      rateCentsPerSqm: row.rateCentsPerSqm,
    }));
  }

  private async readCoefficients(): Promise<Record<string, number>> {
    const rows = await this.prisma.coefficient.findMany({
      orderBy: { key: 'asc' },
    });

    return Object.fromEntries(
      rows.map((row) => [row.key, row.value.toNumber()]),
    );
  }

  private async readRules(): Promise<PricingRule[]> {
    const rows = await this.prisma.pricingRule.findMany();

    return rows
      .map((row) => ({
        id: row.id,
        level: row.level,
        categoryId: row.categoryId,
        materialTypeId: row.materialTypeId,
        name: row.name as PricingRule['name'],
        quantityFormula: row.quantityFormula,
        costFormula: row.costFormula,
        sortOrder: row.sortOrder,
      }))
      .sort(
        (left, right) =>
          RULE_LEVEL_ORDER[left.level] - RULE_LEVEL_ORDER[right.level] ||
          left.sortOrder - right.sortOrder ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      );
  }
}
