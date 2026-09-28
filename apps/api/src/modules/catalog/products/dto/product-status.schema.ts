import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { PublicationStatus } from '../../../../generated/prisma/enums';
import { productAdminSchema } from './product-admin.schema';

export const updateProductStatusSchema = z.object({
  status: z.enum(PublicationStatus),
  revision: z.uuid(),
});

export const productStatusWarningSchema = z.object({
  code: z.literal('USED_AS_DEFAULT_MATERIAL'),
  params: z.object({
    styles: z.array(
      z.object({
        id: z.uuid(),
        name: localizedNameDraftSchema,
      }),
    ),
  }),
});

export const productStatusResponseSchema = productAdminSchema.extend({
  warnings: z.array(productStatusWarningSchema).optional(),
});

export type UpdateProductStatusInput = z.infer<
  typeof updateProductStatusSchema
>;
export type ProductStatusWarning = z.infer<typeof productStatusWarningSchema>;
export type ProductStatusResponse = z.infer<typeof productStatusResponseSchema>;

export class UpdateProductStatusDto extends createZodDto(
  updateProductStatusSchema,
) {}

export class ProductStatusResponseDto extends createZodDto(
  productStatusResponseSchema,
) {}
