import { z } from 'zod';
import {
  CentsSchema,
  FinishLevelSchema,
  LocalizedTextSchema,
  OptionKindSchema,
  OptionUnitSchema,
  ProductUnitSchema,
  RangeSchema,
  RateSourceSchema,
  RuleLevelSchema,
  SurfaceKindSchema,
} from './common';

export const ExchangeRateSchema = z.object({
  rate: z.string().regex(/^\d+\.\d{4}$/),
  date: z.string(),
  source: RateSourceSchema,
});
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const PricingLimitsSchema = z.object({
  totalAreaSqm: RangeSchema,
  rooms: RangeSchema,
  roomSideM: RangeSchema,
  roomHeightM: RangeSchema,
});
export type PricingLimits = z.infer<typeof PricingLimitsSchema>;

export const BaseRateSchema = z.object({
  finishLevel: FinishLevelSchema,
  areaFromSqm: z.number().min(0),
  areaToSqm: z.number(),
  rateCentsPerSqm: z.int().positive(),
});
export type BaseRate = z.infer<typeof BaseRateSchema>;

export const PricingRuleSchema = z.object({
  id: z.string(),
  level: RuleLevelSchema,
  categoryId: z.string().nullable(),
  materialTypeId: z.string().nullable(),
  name: LocalizedTextSchema,
  quantityFormula: z.string().nullable(),
  costFormula: z.string().max(500),
  sortOrder: z.int(),
});
export type PricingRule = z.infer<typeof PricingRuleSchema>;

export const PricingRoomTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
});
export type PricingRoomType = z.infer<typeof PricingRoomTypeSchema>;

export const PricingCategorySchema = z.object({
  id: z.string(),
  wastePercent: z.number().min(0),
  surface: SurfaceKindSchema,
});
export type PricingCategory = z.infer<typeof PricingCategorySchema>;

export const PricingMaterialTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
});
export type PricingMaterialType = z.infer<typeof PricingMaterialTypeSchema>;

export const PricingProductSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  materialTypeId: z.string(),
  priceCents: CentsSchema,
  unit: ProductUnitSchema,
  wastePercentOverride: z.number().min(0).nullable(),
  heatedFloorCompatible: z.boolean(),
  available: z.boolean(),
});
export type PricingProduct = z.infer<typeof PricingProductSchema>;

export const PricingPackageItemSchema = z.object({
  id: z.string(),
  includedInBase: z.boolean(),
  priceCents: CentsSchema.nullable(),
  unit: OptionUnitSchema.nullable(),
});
export type PricingPackageItem = z.infer<typeof PricingPackageItemSchema>;

export const PricingOptionSchema = z.object({
  id: z.string(),
  kind: OptionKindSchema,
  priceCents: CentsSchema,
  unit: OptionUnitSchema,
  roomTypeCodes: z.array(z.string()),
  minQuantity: z.int().nullable(),
  maxQuantity: z.int().nullable(),
  available: z.boolean(),
});
export type PricingOption = z.infer<typeof PricingOptionSchema>;

export const PricingDataSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{16}$/),
  exchangeRate: ExchangeRateSchema.nullable(),
  limits: PricingLimitsSchema,
  baseRates: z.array(BaseRateSchema),
  coefficients: z.record(z.string(), z.number()),
  rules: z.array(PricingRuleSchema),
  roomTypes: z.array(PricingRoomTypeSchema),
  categories: z.array(PricingCategorySchema),
  materialTypes: z.array(PricingMaterialTypeSchema),
  products: z.array(PricingProductSchema),
  packageItems: z.array(PricingPackageItemSchema),
  options: z.array(PricingOptionSchema),
});
export type PricingData = z.infer<typeof PricingDataSchema>;
