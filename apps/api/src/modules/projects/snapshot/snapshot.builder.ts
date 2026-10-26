import { Inject, Injectable } from '@nestjs/common';
import type {
  BaseRate,
  Configuration,
  PricingData,
} from '@roomwise/calc-engine';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import {
  CatalogSnapshotReadService,
  type SnapshotIds,
  type SnapshotStyle,
} from '../../catalog/snapshot-read/catalog-snapshot-read.service';
import { PricingEstimateService } from '../../pricing/estimate/pricing-estimate.service';
import { retiredOptionsOf } from './retired-options';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotV1,
  SnapshotV1Schema,
} from './snapshot.schema';

export interface SnapshotBuildInput {
  configuration: Configuration;
  styleId: string;
  createdAt: Date;
  previous?: SnapshotV1;
}

type SnapshotLine = SnapshotV1['lines'][number];

function previousValues<T>(
  previous: SnapshotV1 | undefined,
  key: (line: SnapshotLine) => string | null,
  value: (line: SnapshotLine) => T | null,
): Map<string, T> {
  const values = new Map<string, T>();

  for (const line of previous?.lines ?? []) {
    const id = key(line);
    const found = value(line);

    if (id !== null && found !== null) {
      values.set(id, found);
    }
  }

  return values;
}

function distinct(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value) => value !== null))];
}

function selectBaseRate(
  configuration: Configuration,
  pricingData: PricingData,
): BaseRate | null {
  const area = configuration.totalAreaSqm;

  return (
    pricingData.baseRates.find(
      (rate) =>
        rate.finishLevel === configuration.finishLevel &&
        rate.areaFromSqm <= area &&
        area < rate.areaToSqm,
    ) ?? null
  );
}

@Injectable()
export class SnapshotBuilder {
  constructor(
    @Inject(PricingEstimateService)
    private readonly pricingEstimate: PricingEstimateService,
    @Inject(CatalogSnapshotReadService)
    private readonly catalog: CatalogSnapshotReadService,
  ) {}

  async build(input: SnapshotBuildInput): Promise<SnapshotV1> {
    const { configuration, styleId, createdAt, previous } = input;
    const { estimate, pricingData } = await this.pricingEstimate.estimate(
      configuration,
      {
        missingReferences: previous ? 'unavailable' : 'reject',
        retiredOptions: previous ? retiredOptionsOf(previous) : undefined,
      },
    );

    const roomTypeIdByCode = new Map(
      pricingData.roomTypes.map((roomType) => [roomType.code, roomType.id]),
    );
    const ids: SnapshotIds = {
      productIds: distinct(estimate.lines.map((line) => line.productId)),
      categoryIds: distinct(estimate.lines.map((line) => line.categoryId)),
      roomTypeIds: distinct(
        configuration.rooms.map(
          (room) => roomTypeIdByCode.get(room.roomTypeCode) ?? null,
        ),
      ),
      optionIds: distinct(estimate.lines.map((line) => line.optionId)),
      packageItemIds: distinct(
        estimate.lines.map((line) => line.packageItemId),
      ),
      styleId,
    };
    const catalog = await this.catalog.read(ids);

    const style = this.resolveStyle(catalog.style, previous);

    if (!style) {
      throw new AppError(ERROR_CODES.STYLE_NOT_FOUND);
    }

    const rooms = configuration.rooms.map(({ selections, ...room }) => {
      const roomTypeId = roomTypeIdByCode.get(room.roomTypeCode);
      const roomType =
        roomTypeId === undefined
          ? undefined
          : catalog.roomTypes.get(roomTypeId);

      if (roomType === undefined) {
        throw new Error(`Room type ${room.roomTypeCode} is missing`);
      }

      return { ...room, roomTypeName: roomType.name };
    });
    const roomNameByClientId = new Map(
      rooms.map((room) => [room.clientId, room.roomTypeName]),
    );
    const ruleById = new Map(pricingData.rules.map((rule) => [rule.id, rule]));

    const previousCategoryNames = previousValues(
      previous,
      (line) => line.categoryId,
      (line) => line.categoryName,
    );
    const previousProducts = previousValues(
      previous,
      (line) => line.productId,
      (line) => line.product,
    );
    const previousOptionNames = previousValues(
      previous,
      (line) => line.optionId,
      (line) => line.optionName,
    );
    const previousPackageItemNames = previousValues(
      previous,
      (line) => line.packageItemId,
      (line) => line.packageItemName,
    );

    const lines = estimate.lines.map((line) => {
      const product =
        line.productId === null
          ? undefined
          : catalog.products.get(line.productId);

      return {
        ...line,
        roomName:
          line.roomClientId === null
            ? null
            : (roomNameByClientId.get(line.roomClientId) ?? null),
        categoryName:
          line.categoryId === null
            ? null
            : (catalog.categories.get(line.categoryId)?.name ??
              previousCategoryNames.get(line.categoryId) ??
              null),
        product:
          product === undefined
            ? line.productId === null
              ? null
              : (previousProducts.get(line.productId) ?? null)
            : {
                name: product.name,
                brand: product.brand,
                manufacturer: product.manufacturer,
                color: product.color,
                size: product.size,
                image: product.image,
              },
        optionName:
          line.optionId === null
            ? null
            : (catalog.options.get(line.optionId)?.name ??
              previousOptionNames.get(line.optionId) ??
              null),
        packageItemName:
          line.packageItemId === null
            ? null
            : (catalog.packageItems.get(line.packageItemId)?.name ??
              previousPackageItemNames.get(line.packageItemId) ??
              null),
        ruleName:
          line.ruleId === null
            ? null
            : (ruleById.get(line.ruleId)?.name ?? null),
      };
    });

    const usedRuleIds = new Set(lines.map((line) => line.ruleId));
    const rules = pricingData.rules
      .filter((rule) => usedRuleIds.has(rule.id))
      .map((rule) => ({
        id: rule.id,
        level: rule.level,
        categoryId: rule.categoryId,
        materialTypeId: rule.materialTypeId,
        quantityFormula: rule.quantityFormula,
        costFormula: rule.costFormula,
      }));

    const snapshot = SnapshotV1Schema.parse({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      createdAt: createdAt.toISOString(),
      pricingVersion: pricingData.version,
      configuration,
      style: { id: style.id, name: style.name },
      rooms,
      lines,
      estimate: {
        totals: estimate.totals,
        warnings: estimate.warnings,
        incomplete: estimate.incomplete,
        currency: estimate.currency,
      },
      pricing: {
        exchangeRate: estimate.exchangeRate,
        baseRate: selectBaseRate(configuration, pricingData),
        coefficients: pricingData.coefficients,
        rules,
      },
    });

    return snapshot;
  }

  private resolveStyle(
    current: SnapshotStyle | null,
    previous: SnapshotV1 | undefined,
  ): SnapshotV1['style'] {
    if (previous) {
      return current ?? previous.style;
    }

    return current?.published ? current : null;
  }
}
