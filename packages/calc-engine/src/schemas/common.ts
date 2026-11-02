import { z } from 'zod';

export const LocalizedTextSchema = z.object({
  en: z.string(),
  uk: z.string(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const ScopeSchema = z.enum(['FULL', 'PARTIAL']);
export type Scope = z.infer<typeof ScopeSchema>;

export const FinishLevelSchema = z.enum(['ROUGH', 'PRE_FINISH', 'LIVED_IN']);
export type FinishLevel = z.infer<typeof FinishLevelSchema>;

export const RuleLevelSchema = z.enum([
  'OBJECT',
  'CATEGORY',
  'MATERIAL_TYPE',
  'SURFACE',
]);
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

export const OptionCodeSchema = z.enum(['HEATED_FLOOR']);
export type OptionCode = z.infer<typeof OptionCodeSchema>;

export const RoomTypeCodeSchema = z.enum([
  'LIVING_ROOM',
  'BEDROOM',
  'KITCHEN',
  'KITCHEN_LIVING',
  'BATHROOM',
  'HALLWAY',
  'STORAGE',
]);
export type RoomTypeCode = z.infer<typeof RoomTypeCodeSchema>;

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

export const LineComponentKindSchema = z.enum(['MATERIAL', 'LABOR', 'PREP']);
export type LineComponentKind = z.infer<typeof LineComponentKindSchema>;

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
