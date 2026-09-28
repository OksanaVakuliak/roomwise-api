import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RoomTypeCode } from '../../../../generated/prisma/enums';

export const publicDefaultMaterialItemSchema = z.object({
  roomTypeCode: z.enum(RoomTypeCode),
  categoryId: z.uuid(),
  productId: z.uuid().nullable(),
});

export const publicDefaultMaterialsResponseSchema = z.object({
  styleId: z.uuid(),
  items: z.array(publicDefaultMaterialItemSchema),
});

export type PublicDefaultMaterialItem = z.infer<
  typeof publicDefaultMaterialItemSchema
>;
export type PublicDefaultMaterialsResponse = z.infer<
  typeof publicDefaultMaterialsResponseSchema
>;

export class PublicDefaultMaterialsResponseDto extends createZodDto(
  publicDefaultMaterialsResponseSchema,
) {}
