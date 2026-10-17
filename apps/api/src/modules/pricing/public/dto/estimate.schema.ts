import {
  ConfigurationSchema,
  EstimateSchema,
  PricingDataSchema,
} from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const estimateRequestSchema = z.object({
  configuration: ConfigurationSchema,
  clientPricingVersion: PricingDataSchema.shape.version.optional(),
});

export const estimateResponseSchema = z.object({
  estimate: EstimateSchema,
  stale: z.boolean(),
  pricingVersion: z.string(),
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
export type EstimateResponse = z.infer<typeof estimateResponseSchema>;

export class EstimateRequestDto extends createZodDto(estimateRequestSchema) {}

export class EstimateResponseDto extends createZodDto(estimateResponseSchema) {}
