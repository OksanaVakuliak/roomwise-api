import { z } from 'zod';
import {
  CentsSchema,
  FinishLevelSchema,
  ProductUnitSchema,
  RoomTypeCodeSchema,
  ScopeSchema,
} from './common';
import { EstimateMessageSchema } from './estimate';

export const RuleSampleSchema = z
  .object({
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
    surfaceArea: z.number().min(0).optional(),
    puttyRequired: z.boolean().optional(),
    object: z.object({
      scope: ScopeSchema,
      totalAreaSqm: z.number().positive().nullable(),
      balconyAreaSqm: z.number().min(0),
      balconyTiles: z.boolean(),
      finishLevel: FinishLevelSchema,
      roomsCount: z.int().min(0),
      bathroomsCount: z.int().min(0),
      roomsFloorArea: z.number().min(0),
      roomsWallArea: z.number().min(0),
      roomsPerimeter: z.number().min(0),
      wetRoomsCount: z.int().min(0),
    }),
  })
  .superRefine((sample, ctx) => {
    const { scope, totalAreaSqm } = sample.object;
    if ((scope === 'FULL') !== (totalAreaSqm !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['object', 'totalAreaSqm'],
        message: scope === 'FULL' ? 'Required' : 'Not allowed',
      });
    }
  });
export type RuleSample = z.infer<typeof RuleSampleSchema>;

export const RulePreviewSchema = z.object({
  quantity: z.number().nullable(),
  amountCents: CentsSchema.nullable(),
  laborCents: CentsSchema.nullable(),
  variables: z.record(
    z.string(),
    z.union([z.number(), z.boolean(), z.string()]),
  ),
  coefficients: z.record(z.string(), z.number()),
  error: EstimateMessageSchema.nullable(),
});
export type RulePreview = z.infer<typeof RulePreviewSchema>;
