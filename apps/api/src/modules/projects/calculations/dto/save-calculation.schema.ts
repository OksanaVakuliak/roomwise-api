import { ConfigurationSchema, PricingDataSchema } from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { versionViewSchema } from '../../presenters/version-view.schema';

export const saveCalculationRequestSchema = z.object({
  configuration: ConfigurationSchema,
  styleId: z.uuid(),
  clientPricingVersion: PricingDataSchema.shape.version,
  clientTotalUsdCents: z.number().int().nonnegative(),
});

export const priceDifferenceSchema = z.object({
  clientTotalUsdCents: z.number().int(),
  savedTotalUsdCents: z.number().int(),
  diffCents: z.number().int(),
});

export const saveCalculationResponseSchema = z.object({
  version: versionViewSchema,
  priceDifference: priceDifferenceSchema.nullable(),
});

export type SaveCalculationRequest = z.infer<
  typeof saveCalculationRequestSchema
>;
export type PriceDifference = z.infer<typeof priceDifferenceSchema>;
export type SaveCalculationResponse = z.infer<
  typeof saveCalculationResponseSchema
>;

export class SaveCalculationRequestDto extends createZodDto(
  saveCalculationRequestSchema,
) {}

export class SaveCalculationResponseDto extends createZodDto(
  saveCalculationResponseSchema,
) {}
