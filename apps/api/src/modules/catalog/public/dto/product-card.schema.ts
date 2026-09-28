import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProductUnit } from '../../../../generated/prisma/enums';
import { imageRefSchema } from './image-ref.schema';

export const publicProductCardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.string(),
  manufacturer: z.string(),
  size: z.string(),
  color: z.string(),
  priceCents: z.number().int().nonnegative(),
  unit: z.enum(ProductUnit),
  materialTypeCode: z.string(),
  heatedFloorCompatible: z.boolean(),
  image: imageRefSchema.nullable(),
});

export const publicProductCardsResponseSchema = z.object({
  items: z.array(publicProductCardSchema),
});

export type PublicProductCard = z.infer<typeof publicProductCardSchema>;
export type PublicProductCardsResponse = z.infer<
  typeof publicProductCardsResponseSchema
>;

export class PublicProductCardsResponseDto extends createZodDto(
  publicProductCardsResponseSchema,
) {}
