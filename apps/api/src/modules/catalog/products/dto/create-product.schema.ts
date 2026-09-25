import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { ProductUnit } from '../../../../generated/prisma/enums';
import { FALLBACK_COLOR_PATTERN } from '../../common/fallback-color.schema';

export const PRODUCT_TEXT_FIELD_MAX_LENGTH = 80;
export const PRODUCT_WASTE_PERCENT_MAX = 100;
export const PRODUCT_MAX_ATTRIBUTES = 30;

const MULTIPLE_PRIMARY_IMAGES_MESSAGE = 'Only one image can be primary';
const DUPLICATE_IMAGE_ID_MESSAGE = 'Duplicate image id';

export const productImageInputSchema = z.object({
  imageId: z.uuid(),
  isPrimary: z.boolean(),
});

export const productAttributeInputSchema = z.object({
  name: localizedNameDraftSchema,
  value: localizedNameDraftSchema,
});

export const productImagesInputSchema = z
  .array(productImageInputSchema)
  .superRefine((images, ctx) => {
    const primaryCount = images.filter((image) => image.isPrimary).length;

    if (primaryCount > 1) {
      ctx.addIssue({
        code: 'custom',
        message: MULTIPLE_PRIMARY_IMAGES_MESSAGE,
        path: [],
      });
    }

    const seen = new Set<string>();

    images.forEach((image, index) => {
      if (seen.has(image.imageId)) {
        ctx.addIssue({
          code: 'custom',
          message: DUPLICATE_IMAGE_ID_MESSAGE,
          path: [index, 'imageId'],
        });
      }
      seen.add(image.imageId);
    });
  });

export const createProductSchema = z.object({
  categoryId: z.uuid(),
  materialTypeId: z.uuid(),
  name: localizedNameDraftSchema,
  description: localizedDescriptionDraftSchema,
  brand: z.string().min(1).max(PRODUCT_TEXT_FIELD_MAX_LENGTH),
  manufacturer: z.string().min(1).max(PRODUCT_TEXT_FIELD_MAX_LENGTH),
  color: localizedNameDraftSchema,
  size: localizedNameDraftSchema,
  priceCents: z.number().int().min(0),
  confirmZeroPrice: z.boolean().default(false),
  unit: z.enum(ProductUnit),
  wastePercentOverride: z
    .number()
    .min(0)
    .max(PRODUCT_WASTE_PERCENT_MAX)
    .nullable()
    .optional(),
  heatedFloorCompatible: z.boolean(),
  images: productImagesInputSchema,
  attributes: z.array(productAttributeInputSchema).max(PRODUCT_MAX_ATTRIBUTES),
  textureImageId: z.uuid().nullable().optional(),
  tileWidthMm: z.number().int().positive().nullable().optional(),
  tileLengthMm: z.number().int().positive().nullable().optional(),
  fallbackColor: z.string().regex(FALLBACK_COLOR_PATTERN).nullable().optional(),
});

export type ProductImageInput = z.infer<typeof productImageInputSchema>;
export type ProductAttributeInput = z.infer<typeof productAttributeInputSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;

export class CreateProductDto extends createZodDto(createProductSchema) {}
