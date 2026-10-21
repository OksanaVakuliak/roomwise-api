import { z } from 'zod';

export const LocalizedTextSchema = z.object({
  en: z.string(),
  uk: z.string(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const FinishLevelSchema = z.enum(['ROUGH', 'PRE_FINISH']);
export type FinishLevel = z.infer<typeof FinishLevelSchema>;

export const RuleLevelSchema = z.enum(['OBJECT', 'CATEGORY', 'MATERIAL_TYPE']);
export type RuleLevel = z.infer<typeof RuleLevelSchema>;

export const RateSourceSchema = z.enum(['NBU', 'MANUAL']);
export type RateSource = z.infer<typeof RateSourceSchema>;

export const SurfaceKindSchema = z.enum(['NONE', 'FLOOR', 'WALLS', 'CEILING']);
export type SurfaceKind = z.infer<typeof SurfaceKindSchema>;

export const ProductUnitSchema = z.enum(['SQM', 'LINEAR_M', 'PIECE']);
export type ProductUnit = z.infer<typeof ProductUnitSchema>;

export const OptionUnitSchema = z.enum([
  'PIECE',
  'ROOM_SQM',
  'ROOM',
  'PROJECT',
]);
export type OptionUnit = z.infer<typeof OptionUnitSchema>;

export const OptionKindSchema = z.enum(['ENGINEERING', 'ADDITIONAL']);
export type OptionKind = z.infer<typeof OptionKindSchema>;

export const RoomTypeCodeSchema = z.enum([
  'LIVING_ROOM',
  'BEDROOM',
  'KITCHEN',
  'KITCHEN_LIVING',
  'BATHROOM',
]);
export type RoomTypeCode = z.infer<typeof RoomTypeCodeSchema>;

export const KitchenTypeSchema = z.enum(['SEPARATE', 'KITCHEN_LIVING']);
export type KitchenType = z.infer<typeof KitchenTypeSchema>;

export const CurrencySchema = z.enum(['USD', 'UAH']);
export type Currency = z.infer<typeof CurrencySchema>;

export const SectionSchema = z.enum([
  'BASE',
  'OBJECT',
  'MATERIALS',
  'ENGINEERING',
  'ADDITIONAL',
]);
export type Section = z.infer<typeof SectionSchema>;

export const LineStatusSchema = z.enum([
  'OK',
  'INCLUDED',
  'NOT_CALCULATED',
  'UNAVAILABLE',
  'ERROR',
]);
export type LineStatus = z.infer<typeof LineStatusSchema>;

export const CentsSchema = z.int().min(0);
export type Cents = z.infer<typeof CentsSchema>;

export const RangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});
export type Range = z.infer<typeof RangeSchema>;
