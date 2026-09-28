import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RoomTypeCode, SurfaceKind } from '../../../../generated/prisma/enums';

export const PERCENT_MAX = 100;

export const publicRoomTypeCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  surface: z.enum(SurfaceKind),
  wastePercent: z.number().min(0).max(PERCENT_MAX),
  productCount: z.number().int().nonnegative(),
});

export const publicRoomTypeSchema = z.object({
  id: z.uuid(),
  code: z.enum(RoomTypeCode),
  name: z.string(),
  categories: z.array(publicRoomTypeCategorySchema),
});

export const publicRoomTypesResponseSchema = z.object({
  items: z.array(publicRoomTypeSchema),
});

export type PublicRoomTypeCategory = z.infer<
  typeof publicRoomTypeCategorySchema
>;
export type PublicRoomType = z.infer<typeof publicRoomTypeSchema>;
export type PublicRoomTypesResponse = z.infer<
  typeof publicRoomTypesResponseSchema
>;

export class PublicRoomTypesResponseDto extends createZodDto(
  publicRoomTypesResponseSchema,
) {}
