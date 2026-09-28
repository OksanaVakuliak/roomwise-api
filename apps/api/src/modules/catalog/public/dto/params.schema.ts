import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const categoryIdParamSchema = z.object({
  categoryId: z.uuid(),
});

export class CategoryIdParamDto extends createZodDto(categoryIdParamSchema) {}

export const productIdParamSchema = z.object({
  productId: z.uuid(),
});

export class ProductIdParamDto extends createZodDto(productIdParamSchema) {}

export const styleIdParamSchema = z.object({
  styleId: z.uuid(),
});

export class StyleIdParamDto extends createZodDto(styleIdParamSchema) {}
