import { z } from 'zod';
import {
  CentsSchema,
  CurrencySchema,
  LineStatusSchema,
  SectionSchema,
} from './common';
import { ExchangeRateSchema } from './pricing-data';

export const EstimateMessageSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type EstimateMessage = z.infer<typeof EstimateMessageSchema>;

export const EstimateLineSchema = z.object({
  id: z.string(),
  section: SectionSchema,
  status: LineStatusSchema,
  roomClientId: z.string().nullable(),
  categoryId: z.string().nullable(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  packageItemId: z.string().nullable(),
  ruleId: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPriceCents: CentsSchema.nullable(),
  amountCents: CentsSchema,
  amountUahKopecks: CentsSchema.nullable(),
  warnings: z.array(EstimateMessageSchema),
  error: EstimateMessageSchema.nullable(),
});
export type EstimateLine = z.infer<typeof EstimateLineSchema>;

export const SectionTotalSchema = z.object({
  usdCents: CentsSchema,
  uahKopecks: CentsSchema.nullable(),
});
export type SectionTotal = z.infer<typeof SectionTotalSchema>;

export const EstimateTotalsSchema = z.object({
  usdCents: CentsSchema,
  uahKopecks: CentsSchema.nullable(),
  sections: z.record(SectionSchema, SectionTotalSchema),
});
export type EstimateTotals = z.infer<typeof EstimateTotalsSchema>;

export const EstimateWarningSchema = EstimateMessageSchema.extend({
  lineId: z.string().optional(),
});
export type EstimateWarning = z.infer<typeof EstimateWarningSchema>;

export const EstimateSchema = z.object({
  pricingVersion: z.string(),
  currency: CurrencySchema,
  exchangeRate: ExchangeRateSchema.nullable(),
  lines: z.array(EstimateLineSchema),
  totals: EstimateTotalsSchema,
  warnings: z.array(EstimateWarningSchema),
  incomplete: z.boolean(),
});
export type Estimate = z.infer<typeof EstimateSchema>;
