import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import {
  ProductUnit,
  PublicationStatus,
} from '../../../../generated/prisma/enums';
import { FALLBACK_COLOR_PATTERN } from '../../common/fallback-color.schema';
import {
  imageRefSchema,
  textureRefSchema,
} from '../../public/dto/image-ref.schema';
import {
  PRODUCT_TEXT_FIELD_MAX_LENGTH,
  PRODUCT_WASTE_PERCENT_MAX,
  productAttributeInputSchema,
} from './create-product.schema';

export const productImageAdminSchema = imageRefSchema.extend({
  isPrimary: z.boolean(),
});

export const productAdminSchema = z
  .object({
    id: z.uuid(),
    categoryId: z.uuid(),
    materialTypeId: z.uuid(),
    name: localizedNameDraftSchema,
    description: localizedDescriptionDraftSchema,
    brand: z.string().min(1).max(PRODUCT_TEXT_FIELD_MAX_LENGTH),
    manufacturer: z.string().min(1).max(PRODUCT_TEXT_FIELD_MAX_LENGTH),
    color: localizedNameDraftSchema,
    size: localizedNameDraftSchema,
    priceCents: z.number().int().nonnegative(),
    unit: z.enum(ProductUnit),
    wastePercentOverride: z
      .number()
      .min(0)
      .max(PRODUCT_WASTE_PERCENT_MAX)
      .nullable(),
    heatedFloorCompatible: z.boolean(),
    images: z.array(productImageAdminSchema),
    attributes: z.array(productAttributeInputSchema),
    tileWidthMm: z.number().int().positive().nullable(),
    tileLengthMm: z.number().int().positive().nullable(),
    fallbackColor: z.string().regex(FALLBACK_COLOR_PATTERN).nullable(),
    texture: textureRefSchema.nullable(),
    status: z.enum(PublicationStatus),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export type ProductImageAdmin = z.infer<typeof productImageAdminSchema>;
export type ProductAdmin = z.infer<typeof productAdminSchema>;

export class ProductAdminDto extends createZodDto(productAdminSchema) {}
