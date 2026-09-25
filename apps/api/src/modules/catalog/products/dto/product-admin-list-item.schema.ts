import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { paginatedResponseSchema } from '../../../../common/pagination/pagination.schema';
import {
  ProductUnit,
  PublicationStatus,
} from '../../../../generated/prisma/enums';
import { imageRefSchema } from '../../public/dto/image-ref.schema';

export const productAdminListItemSchema = z
  .object({
    id: z.uuid(),
    name: localizedNameDraftSchema,
    categoryId: z.uuid(),
    status: z.enum(PublicationStatus),
    priceCents: z.number().int().nonnegative(),
    unit: z.enum(ProductUnit),
    image: imageRefSchema.nullable(),
  })
  .extend(auditSchema.shape);

export const productAdminListResponseSchema = paginatedResponseSchema(
  productAdminListItemSchema,
);

export type ProductAdminListItem = z.infer<typeof productAdminListItemSchema>;
export type ProductAdminListResponse = z.infer<
  typeof productAdminListResponseSchema
>;

export class ProductAdminListItemDto extends createZodDto(
  productAdminListItemSchema,
) {}

export class ProductAdminListResponseDto extends createZodDto(
  productAdminListResponseSchema,
) {}
