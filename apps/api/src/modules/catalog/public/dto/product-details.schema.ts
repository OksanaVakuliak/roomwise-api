import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProductUnit, SurfaceKind } from '../../../../generated/prisma/enums';
import { imageRefSchema, textureRefSchema } from './image-ref.schema';
import { PERCENT_MAX } from './room-type.schema';

const FALLBACK_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

export const productAttributeSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const productSurfaceSchema = z.object({
  kind: z.enum(SurfaceKind),
  texture: textureRefSchema,
  tileWidthMm: z.number().int().positive(),
  tileLengthMm: z.number().int().positive(),
  fallbackColor: z.string().regex(FALLBACK_COLOR_PATTERN),
});

export const publicProductDetailsSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string(),
  brand: z.string(),
  manufacturer: z.string(),
  size: z.string(),
  color: z.string(),
  priceCents: z.number().int().nonnegative(),
  unit: z.enum(ProductUnit),
  materialTypeCode: z.string(),
  heatedFloorCompatible: z.boolean(),
  wastePercent: z.number().min(0).max(PERCENT_MAX),
  images: z.array(imageRefSchema),
  attributes: z.array(productAttributeSchema),
  surface: productSurfaceSchema.nullable(),
});

export type ProductAttribute = z.infer<typeof productAttributeSchema>;
export type ProductSurface = z.infer<typeof productSurfaceSchema>;
export type PublicProductDetails = z.infer<typeof publicProductDetailsSchema>;

export class PublicProductDetailsResponseDto extends createZodDto(
  publicProductDetailsSchema,
) {}
