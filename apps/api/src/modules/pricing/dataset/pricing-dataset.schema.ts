import { z } from 'zod';
import { localizedNameSchema } from '../../../common/i18n/localized-text.schema';
import {
  CoefficientGroup,
  RuleLevel,
  SurfaceKind,
} from '../../../generated/prisma/enums';

export const COEFFICIENT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
export const FORMULA_MAX_LENGTH = 500;
const DEFAULT_MISSING_AREA_HINT_SQM = 5;

const rangeSchema = z
  .object({ min: z.number(), max: z.number() })
  .refine((range) => range.min < range.max, 'min must be below max');

export const seedPricingLimitsSchema = z.object({
  totalAreaSqm: rangeSchema,
  rooms: rangeSchema,
  roomSideM: rangeSchema,
  roomHeightM: rangeSchema,
  missingAreaHintSqm: z
    .number()
    .positive()
    .default(DEFAULT_MISSING_AREA_HINT_SQM),
});
export type SeedPricingLimits = z.input<typeof seedPricingLimitsSchema>;

export const seedCoefficientSchema = z.object({
  key: z.string().regex(COEFFICIENT_KEY_PATTERN),
  name: localizedNameSchema,
  value: z.number().min(0),
  unit: localizedNameSchema,
  group: z.enum(CoefficientGroup).default(CoefficientGroup.MATERIAL_EXTRA),
});
export type SeedCoefficient = z.input<typeof seedCoefficientSchema>;

export const seedPricingRuleSchema = z
  .object({
    id: z.uuid(),
    level: z.enum(RuleLevel),
    categoryId: z.uuid().nullable(),
    materialTypeId: z.uuid().nullable(),
    surface: z.enum(SurfaceKind).nullable().default(null),
    baseComponent: z.boolean().default(false),
    name: localizedNameSchema,
    quantityFormula: z.string().max(FORMULA_MAX_LENGTH).nullable(),
    costFormula: z.string().min(1).max(FORMULA_MAX_LENGTH),
    laborFormula: z
      .string()
      .min(1)
      .max(FORMULA_MAX_LENGTH)
      .nullable()
      .default(null),
    coefficientKeys: z.array(z.string().regex(COEFFICIENT_KEY_PATTERN)),
    sortOrder: z.int().nonnegative(),
  })
  .superRefine((rule, ctx) => {
    const expectsCategory =
      rule.level === RuleLevel.CATEGORY ||
      rule.level === RuleLevel.MATERIAL_TYPE;
    const expectsMaterialType = rule.level === RuleLevel.MATERIAL_TYPE;
    const expectsQuantity = expectsCategory;
    const expectsSurface = rule.level === RuleLevel.SURFACE;

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
    if (expectsSurface !== (rule.surface !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['surface'],
        message: 'Invalid',
      });
    }
    if (rule.baseComponent && rule.level !== RuleLevel.OBJECT) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseComponent'],
        message: 'Only object rules can be base components',
      });
    }
    if (rule.laborFormula !== null && !expectsCategory) {
      ctx.addIssue({
        code: 'custom',
        path: ['laborFormula'],
        message: 'Invalid',
      });
    }
  });
export type SeedPricingRule = z.input<typeof seedPricingRuleSchema>;

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
    coefficients: z.array(seedCoefficientSchema),
    rules: z.array(seedPricingRuleSchema),
  })
  .superRefine((dataset, ctx) => {
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
          (rule) =>
            `${rule.level}:${rule.categoryId}:${rule.materialTypeId}:${rule.surface}`,
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
