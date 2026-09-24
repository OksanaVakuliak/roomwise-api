import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import {
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../../generated/prisma/enums';

export const CATEGORY_WASTE_PERCENT_MAX = 100;

export const categoryAdminSchema = z
  .object({
    id: z.uuid(),
    name: localizedNameDraftSchema,
    wastePercent: z.number().min(0).max(CATEGORY_WASTE_PERCENT_MAX),
    surface: z.enum(SurfaceKind),
    status: z.enum(PublicationStatus),
    productCount: z.number().int().nonnegative(),
    roomTypeCodes: z.array(z.enum(RoomTypeCode)),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const categoryAdminListResponseSchema = z.object({
  items: z.array(categoryAdminSchema),
});

export type CategoryAdmin = z.infer<typeof categoryAdminSchema>;
export type CategoryAdminListResponse = z.infer<
  typeof categoryAdminListResponseSchema
>;

export class CategoryAdminDto extends createZodDto(categoryAdminSchema) {}

export class CategoryAdminListResponseDto extends createZodDto(
  categoryAdminListResponseSchema,
) {}
