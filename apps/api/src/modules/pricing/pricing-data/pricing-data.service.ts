import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  type BaseRate,
  type PricingData,
  PricingDataSchema,
  type PricingLimits,
  type PricingRule,
} from '@roomwise/calc-engine';
import type { Subscription } from 'rxjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { CatalogChangeNotifier } from '../../catalog/common/catalog-change.notifier';
import { CatalogPricingReadService } from '../../catalog/pricing-read/catalog-pricing-read.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { canonicalHash } from './canonical-hash';

const SETTINGS_ID = 1;
const RULE_LEVEL_ORDER = { OBJECT: 0, CATEGORY: 1, MATERIAL_TYPE: 2 } as const;

type PricingDataBody = Omit<PricingData, 'version'>;
type SettingsRow = Prisma.PricingSettingsGetPayload<object>;

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

@Injectable()
export class PricingDataService implements OnModuleInit, OnModuleDestroy {
  private cached: PricingData | null = null;
  private pending: Promise<PricingData> | null = null;
  private generation = 0;
  private subscriptions: Subscription[] = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogPricingReadService)
    private readonly catalog: CatalogPricingReadService,
    @Inject(CatalogChangeNotifier)
    private readonly catalogChanges: CatalogChangeNotifier,
    @Inject(ExchangeRateService)
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  onModuleInit(): void {
    this.subscriptions = [
      this.catalogChanges.changes$.subscribe(() => this.invalidate()),
      this.exchangeRates.changes$.subscribe(() => this.invalidate()),
    ];
  }

  onModuleDestroy(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
  }

  invalidate(): void {
    this.generation += 1;
    this.cached = null;
    this.pending = null;
  }

  async get(): Promise<PricingData> {
    this.exchangeRates.requestRefreshIfStale();

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
      exchangeRate,
    ] = await Promise.all([
      this.catalog.roomTypes(),
      this.catalog.categories(),
      this.catalog.materialTypes(),
      this.catalog.products(),
      this.catalog.packageItems(),
      this.catalog.options(),
      this.readSettings(),
      this.readBaseRates(),
      this.coefficients(),
      this.readRules(),
      this.exchangeRates.activeRate(),
    ]);
    const limits = toLimits(settings);

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

  async coefficients(): Promise<Record<string, number>> {
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
