import {
  BaseRateSchema,
  ConfigurationSchema,
  CurrencySchema,
  EstimateLineSchema,
  EstimateTotalsSchema,
  EstimateWarningSchema,
  ExchangeRateSchema,
  LocalizedTextSchema,
  RoomConfigurationSchema,
  RuleLevelSchema,
} from '@roomwise/calc-engine';
import { z } from 'zod';

export const SNAPSHOT_SCHEMA_VERSION = 1;

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

const SnapshotRuleSchema = z.object({
  id: z.string(),
  level: RuleLevelSchema,
  categoryId: z.string().nullable(),
  materialTypeId: z.string().nullable(),
  quantityFormula: z.string().nullable(),
  costFormula: z.string(),
});

export const SnapshotV1Schema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
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
    baseRate: BaseRateSchema.nullable(),
    coefficients: z.record(z.string(), z.number()),
    rules: z.array(SnapshotRuleSchema),
  }),
});
export type SnapshotV1 = z.infer<typeof SnapshotV1Schema>;
