import { z } from 'zod';
import {
  CentsSchema,
  FinishLevelSchema,
  ProductUnitSchema,
  RoomTypeCodeSchema,
} from './common';
import { EstimateMessageSchema } from './estimate';

export const RuleSampleSchema = z.object({
  room: z
    .object({
      roomTypeCode: RoomTypeCodeSchema,
      lengthM: z.number().positive(),
      widthM: z.number().positive(),
      heightM: z.number().positive(),
      heatedFloor: z.boolean(),
    })
    .optional(),
  product: z
    .object({
      priceCents: CentsSchema,
      unit: ProductUnitSchema,
      wastePercent: z.number().min(0),
    })
    .optional(),
  object: z.object({
    totalAreaSqm: z.number().positive(),
    balconyAreaSqm: z.number().min(0),
    balconyTiles: z.boolean(),
    finishLevel: FinishLevelSchema,
    roomsCount: z.int().min(0),
    bathroomsCount: z.int().min(0),
  }),
});
export type RuleSample = z.infer<typeof RuleSampleSchema>;

export const RulePreviewSchema = z.object({
  quantity: z.number().nullable(),
  amountCents: CentsSchema.nullable(),
  variables: z.record(
    z.string(),
    z.union([z.number(), z.boolean(), z.string()]),
  ),
  coefficients: z.record(z.string(), z.number()),
  error: EstimateMessageSchema.nullable(),
});
export type RulePreview = z.infer<typeof RulePreviewSchema>;
