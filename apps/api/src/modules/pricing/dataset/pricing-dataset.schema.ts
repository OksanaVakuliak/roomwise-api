import { z } from 'zod';
import { localizedNameSchema } from '../../../common/i18n/localized-text.schema';
import { FinishLevel, RuleLevel } from '../../../generated/prisma/enums';

export const COEFFICIENT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
export const FORMULA_MAX_LENGTH = 500;

const rangeSchema = z
  .object({ min: z.number(), max: z.number() })
  .refine((range) => range.min < range.max, 'min must be below max');

export const seedPricingLimitsSchema = z.object({
  totalAreaSqm: rangeSchema,
  rooms: rangeSchema,
  roomSideM: rangeSchema,
  roomHeightM: rangeSchema,
});
export type SeedPricingLimits = z.infer<typeof seedPricingLimitsSchema>;

export const seedBaseRateSchema = z
  .object({
    finishLevel: z.enum(FinishLevel),
    areaFromSqm: z.number().min(0),
    areaToSqm: z.number(),
    rateCentsPerSqm: z.int().positive(),
  })
  .refine((rate) => rate.areaToSqm > rate.areaFromSqm, {
    message: 'areaToSqm must be above areaFromSqm',
    path: ['areaToSqm'],
  });
export type SeedBaseRate = z.infer<typeof seedBaseRateSchema>;

export const seedCoefficientSchema = z.object({
  key: z.string().regex(COEFFICIENT_KEY_PATTERN),
  name: localizedNameSchema,
  value: z.number().min(0),
  unit: localizedNameSchema,
});
export type SeedCoefficient = z.infer<typeof seedCoefficientSchema>;

export const seedPricingRuleSchema = z
  .object({
    id: z.uuid(),
    level: z.enum(RuleLevel),
    categoryId: z.uuid().nullable(),
    materialTypeId: z.uuid().nullable(),
    name: localizedNameSchema,
    quantityFormula: z.string().max(FORMULA_MAX_LENGTH).nullable(),
    costFormula: z.string().min(1).max(FORMULA_MAX_LENGTH),
    coefficientKeys: z.array(z.string().regex(COEFFICIENT_KEY_PATTERN)),
    sortOrder: z.int().nonnegative(),
  })
  .superRefine((rule, ctx) => {
    const expectsCategory = rule.level !== RuleLevel.OBJECT;
    const expectsMaterialType = rule.level === RuleLevel.MATERIAL_TYPE;
    const expectsQuantity = rule.level !== RuleLevel.OBJECT;

    if (expectsCategory !== (rule.categoryId !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Invalid',
      });
    }
    if (expectsMaterialType !== (rule.materialTypeId !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['materialTypeId'],
        message: 'Invalid',
      });
    }
    if (expectsQuantity !== (rule.quantityFormula !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantityFormula'],
        message: 'Invalid',
      });
    }
  });
export type SeedPricingRule = z.infer<typeof seedPricingRuleSchema>;

function findBaseRateGap(rates: SeedBaseRate[], limits: SeedPricingLimits) {
  const { min, max } = limits.totalAreaSqm;

  for (const finishLevel of Object.values(FinishLevel)) {
    const ranges = rates
      .filter((rate) => rate.finishLevel === finishLevel)
      .sort((a, b) => a.areaFromSqm - b.areaFromSqm);
    let covered = min;
    let previousTo: number | undefined;

    for (const range of ranges) {
      if (range.areaFromSqm > covered) {
        return { finishLevel, from: covered, to: range.areaFromSqm };
      }
      if (previousTo !== undefined && range.areaFromSqm < previousTo) {
        return { finishLevel, from: range.areaFromSqm, to: previousTo };
      }
      previousTo = range.areaToSqm;
      covered = Math.max(covered, range.areaToSqm);
    }

    if (covered <= max) {
      return { finishLevel, from: covered, to: max };
    }
  }

  return undefined;
}

function findDuplicate(keys: string[]): string | undefined {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}

export const pricingDatasetSchema = z
  .object({
    limits: seedPricingLimitsSchema,
    baseRates: z.array(seedBaseRateSchema).min(1),
    coefficients: z.array(seedCoefficientSchema),
    rules: z.array(seedPricingRuleSchema),
  })
  .superRefine((dataset, ctx) => {
    const gap = findBaseRateGap(dataset.baseRates, dataset.limits);
    if (gap) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseRates'],
        message: `${gap.finishLevel} rates have a gap or overlap between ${gap.from} and ${gap.to}`,
      });
    }

    const duplicateKey = findDuplicate(
      dataset.coefficients.map((coefficient) => coefficient.key),
    );
    if (duplicateKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['coefficients'],
        message: `Duplicate coefficient key ${duplicateKey}`,
      });
    }

    const duplicateId = findDuplicate(dataset.rules.map((rule) => rule.id));
    if (duplicateId) {
      ctx.addIssue({
        code: 'custom',
        path: ['rules'],
        message: `Duplicate rule id ${duplicateId}`,
      });
    }

    const duplicateTarget = findDuplicate(
      dataset.rules
        .filter((rule) => rule.level !== RuleLevel.OBJECT)
        .map(
          (rule) => `${rule.level}:${rule.categoryId}:${rule.materialTypeId}`,
        ),
    );
    if (duplicateTarget) {
      ctx.addIssue({
        code: 'custom',
        path: ['rules'],
        message: `Duplicate rule target ${duplicateTarget}`,
      });
    }

    const keys = new Set(dataset.coefficients.map((c) => c.key));
    dataset.rules.forEach((rule, index) => {
      for (const key of rule.coefficientKeys) {
        if (!keys.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rules', index, 'coefficientKeys'],
            message: `Unknown coefficient ${key}`,
          });
        }
      }
    });
  });
export type PricingDataset = z.infer<typeof pricingDatasetSchema>;
