import {
  ConfigurationSchema,
  CurrencySchema,
  EstimateLineSchema,
  EstimateTotalsSchema,
  EstimateWarningSchema,
  ExchangeRateSchema,
  FinishLevelSchema,
  LocalizedTextSchema,
  RoomConfigurationSchema,
  RuleLevelSchema,
} from '@roomwise/calc-engine';
import { z } from 'zod';
import { ruleSurfaceSchema } from '../../../common/pricing/rule-surface.schema';

export const SNAPSHOT_SCHEMA_VERSION = 2;

const OptionalNameSchema = LocalizedTextSchema.nullable();

const SnapshotImageSchema = z.object({
  id: z.string(),
  publicId: z.string(),
});

const SnapshotProductSchema = z.object({
  name: LocalizedTextSchema,
  brand: z.string(),
  manufacturer: z.string(),
  color: LocalizedTextSchema,
  size: LocalizedTextSchema,
  image: SnapshotImageSchema.nullable(),
});

const SnapshotRoomSchema = RoomConfigurationSchema.omit({
  selections: true,
}).extend({ roomTypeName: LocalizedTextSchema });

const SnapshotLineSchema = EstimateLineSchema.extend({
  roomName: OptionalNameSchema,
  categoryName: OptionalNameSchema,
  product: SnapshotProductSchema.nullable(),
  optionName: OptionalNameSchema,
  packageItemName: OptionalNameSchema,
  ruleName: OptionalNameSchema,
});

const LegacyBaseRateSchema = z.object({
  finishLevel: FinishLevelSchema,
  areaFromSqm: z.number().min(0),
  areaToSqm: z.number(),
  rateCentsPerSqm: z.int().positive(),
});

const SnapshotRuleSchema = z.object({
  id: z.string(),
  level: RuleLevelSchema,
  categoryId: z.string().nullable(),
  materialTypeId: z.string().nullable(),
  quantityFormula: z.string().nullable(),
  costFormula: z.string(),
  surface: ruleSurfaceSchema.nullable().optional(),
  baseComponent: z.boolean().optional(),
  laborFormula: z.string().nullable().optional(),
});

export const SnapshotSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.iso.datetime(),
  pricingVersion: z.string(),
  configuration: ConfigurationSchema,
  style: z.object({ id: z.string(), name: LocalizedTextSchema }).nullable(),
  rooms: z.array(SnapshotRoomSchema),
  lines: z.array(SnapshotLineSchema),
  estimate: z.object({
    totals: EstimateTotalsSchema,
    warnings: z.array(EstimateWarningSchema),
    incomplete: z.boolean(),
    currency: CurrencySchema,
  }),
  pricing: z.object({
    exchangeRate: ExchangeRateSchema.nullable(),
    baseRate: LegacyBaseRateSchema.nullable(),
    coefficients: z.record(z.string(), z.number()),
    accessories: z.record(z.string(), LocalizedTextSchema).optional(),
    rules: z.array(SnapshotRuleSchema),
  }),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
