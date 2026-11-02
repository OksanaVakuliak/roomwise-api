import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { RateSource, RuleLevel } from '../../../generated/prisma/enums';
import type { PricingDataset } from './pricing-dataset.schema';

const SETTINGS_ID = 1;

export interface PricingDatasetRows {
  limits: Prisma.PricingSettingsUncheckedCreateInput;
  coefficients: Prisma.CoefficientCreateManyInput[];
  rules: Prisma.PricingRuleCreateManyInput[];
}

export function buildLimitsRow(
  limits: PricingDataset['limits'],
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
    missingAreaHintSqm: limits.missingAreaHintSqm,
  };
}

export function buildPricingDatasetRows(
  dataset: PricingDataset,
): PricingDatasetRows {
  return {
    limits: buildLimitsRow(dataset.limits),
    coefficients: dataset.coefficients.map((coefficient) => ({
      key: coefficient.key,
      name: coefficient.name,
      value: coefficient.value,
      unit: coefficient.unit,
      group: coefficient.group,
    })),
    rules: dataset.rules.map((rule) => ({
      id: rule.id,
      level: rule.level,
      categoryId: rule.categoryId,
      materialTypeId: rule.materialTypeId,
      surface: rule.surface,
      baseComponent: rule.baseComponent,
      name: rule.name,
      quantityFormula: rule.quantityFormula,
      costFormula: rule.costFormula,
      laborFormula: rule.laborFormula,
      coefficientKeys: rule.coefficientKeys,
      sortOrder: rule.sortOrder,
    })),
  };
}

function ruleTarget(
  rule: Prisma.PricingRuleCreateManyInput,
): Prisma.PricingRuleWhereInput {
  if (rule.level === RuleLevel.OBJECT) return { id: rule.id };
  if (rule.level === RuleLevel.SURFACE) {
    return { level: rule.level, surface: rule.surface };
  }
  return {
    level: rule.level,
    categoryId: rule.categoryId,
    materialTypeId: rule.materialTypeId,
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

    for (const coefficient of rows.coefficients) {
      const { key, value: _value, ...data } = coefficient;
      await tx.coefficient.upsert({
        where: { key },
        create: coefficient,
        update: { ...data, ...rewrittenBySeed() },
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
      where: ruleTarget(rule),
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
