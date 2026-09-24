import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  OptionKind,
  OptionUnit,
  RoomTypeCode,
} from '../../../../generated/prisma/enums';
import { imageRefSchema } from './image-ref.schema';

const QUANTITY_MAX = 100;

export const engineeringPackageItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  includedInBase: z.boolean(),
  priceCents: z.number().int().nonnegative().nullable(),
  unit: z.enum(OptionUnit).nullable(),
});

export const engineeringOptionSchema = z.object({
  id: z.uuid(),
  kind: z.enum(OptionKind),
  name: z.string(),
  description: z.string(),
  image: imageRefSchema.nullable(),
  priceCents: z.number().int().nonnegative(),
  unit: z.enum(OptionUnit),
  perRoom: z.boolean(),
  roomTypeCodes: z.array(z.enum(RoomTypeCode)),
  minQuantity: z.number().int().min(1).max(QUANTITY_MAX).nullable(),
  maxQuantity: z.number().int().min(1).max(QUANTITY_MAX).nullable(),
});

export const publicEngineeringResponseSchema = z.object({
  packageItems: z.array(engineeringPackageItemSchema),
  options: z.array(engineeringOptionSchema),
});

export type EngineeringPackageItem = z.infer<
  typeof engineeringPackageItemSchema
>;
export type EngineeringOption = z.infer<typeof engineeringOptionSchema>;
export type PublicEngineeringResponse = z.infer<
  typeof publicEngineeringResponseSchema
>;

export class PublicEngineeringResponseDto extends createZodDto(
  publicEngineeringResponseSchema,
) {}
