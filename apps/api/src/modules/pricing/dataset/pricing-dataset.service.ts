import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { RateSource, RuleLevel } from '../../../generated/prisma/enums';
import type {
  PricingDataset,
  SeedPricingLimits,
} from './pricing-dataset.schema';

const SETTINGS_ID = 1;

export interface PricingDatasetRows {
  limits: Prisma.PricingSettingsUncheckedCreateInput;
  baseRates: Prisma.BaseRateCreateManyInput[];
  coefficients: Prisma.CoefficientCreateManyInput[];
  rules: Prisma.PricingRuleCreateManyInput[];
}

export function buildLimitsRow(
  limits: SeedPricingLimits,
): Prisma.PricingSettingsUncheckedCreateInput {
  return {
    id: SETTINGS_ID,
    totalAreaMinSqm: limits.totalAreaSqm.min,
    totalAreaMaxSqm: limits.totalAreaSqm.max,
    roomsMin: limits.rooms.min,
    roomsMax: limits.rooms.max,
    roomSideMinM: limits.roomSideM.min,
    roomSideMaxM: limits.roomSideM.max,
    roomHeightMinM: limits.roomHeightM.min,
    roomHeightMaxM: limits.roomHeightM.max,
  };
}

export function buildPricingDatasetRows(
  dataset: PricingDataset,
): PricingDatasetRows {
  return {
    limits: buildLimitsRow(dataset.limits),
    baseRates: dataset.baseRates.map((rate) => ({
      finishLevel: rate.finishLevel,
      areaFromSqm: rate.areaFromSqm,
      areaToSqm: rate.areaToSqm,
      rateCentsPerSqm: rate.rateCentsPerSqm,
    })),
    coefficients: dataset.coefficients.map((coefficient) => ({
      key: coefficient.key,
      name: coefficient.name,
      value: coefficient.value,
      unit: coefficient.unit,
    })),
    rules: dataset.rules.map((rule) => ({
      id: rule.id,
      level: rule.level,
      categoryId: rule.categoryId,
      materialTypeId: rule.materialTypeId,
      name: rule.name,
      quantityFormula: rule.quantityFormula,
      costFormula: rule.costFormula,
      coefficientKeys: rule.coefficientKeys,
      sortOrder: rule.sortOrder,
    })),
  };
}

function rewrittenBySeed() {
  return { revision: randomUUID(), updatedById: null };
}

@Injectable()
export class PricingDatasetService {
  async upsert(
    dataset: PricingDataset,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const rows = buildPricingDatasetRows(dataset);

    const { id: _id, ...limits } = rows.limits;
    await tx.pricingSettings.upsert({
      where: { id: SETTINGS_ID },
      create: rows.limits,
      update: limits,
    });

    for (const rate of rows.baseRates) {
      const { finishLevel, areaFromSqm, ...data } = rate;
      await tx.baseRate.upsert({
        where: { finishLevel_areaFromSqm: { finishLevel, areaFromSqm } },
        create: rate,
        update: { ...data, ...rewrittenBySeed() },
      });
    }

    for (const coefficient of rows.coefficients) {
      await tx.coefficient.upsert({
        where: { key: coefficient.key },
        create: coefficient,
        update: { ...coefficient, ...rewrittenBySeed() },
      });
    }

    for (const rule of rows.rules) {
      await this.upsertRule(rule, tx);
    }
  }

  async replace(
    dataset: PricingDataset,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const rows = buildPricingDatasetRows(dataset);

    await tx.pricingSettings.updateMany({ data: { manualRateId: null } });
    await tx.exchangeRate.deleteMany({ where: { source: RateSource.MANUAL } });
    await tx.pricingRule.deleteMany({});
    await tx.coefficient.deleteMany({});
    await tx.baseRate.deleteMany({});

    await tx.baseRate.createMany({ data: rows.baseRates });
    await tx.coefficient.createMany({ data: rows.coefficients });
    await tx.pricingRule.createMany({ data: rows.rules });

    const { id: _id, ...limits } = rows.limits;
    await tx.pricingSettings.upsert({
      where: { id: SETTINGS_ID },
      create: rows.limits,
      update: limits,
    });
  }

  private async upsertRule(
    rule: Prisma.PricingRuleCreateManyInput,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const existing = await tx.pricingRule.findFirst({
      where:
        rule.level === RuleLevel.OBJECT
          ? { id: rule.id }
          : {
              level: rule.level,
              categoryId: rule.categoryId,
              materialTypeId: rule.materialTypeId,
            },
      select: { id: true },
    });

    if (!existing) {
      await tx.pricingRule.create({ data: rule });
      return;
    }

    const { id: _id, ...data } = rule;
    await tx.pricingRule.update({
      where: { id: existing.id },
      data: { ...data, ...rewrittenBySeed() },
    });
  }
}
