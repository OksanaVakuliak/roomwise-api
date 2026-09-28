import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import {
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../../generated/prisma/enums';

export const roomTypeCategoryAdminSchema = z.object({
  id: z.uuid(),
  name: localizedNameDraftSchema,
  status: z.enum(PublicationStatus),
  surface: z.enum(SurfaceKind),
});

export const roomTypeAdminSchema = z
  .object({
    id: z.uuid(),
    code: z.enum(RoomTypeCode),
    name: localizedNameDraftSchema,
    categories: z.array(roomTypeCategoryAdminSchema),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const roomTypeAdminListResponseSchema = z.object({
  items: z.array(roomTypeAdminSchema),
});

export type RoomTypeCategoryAdmin = z.infer<typeof roomTypeCategoryAdminSchema>;
export type RoomTypeAdmin = z.infer<typeof roomTypeAdminSchema>;
export type RoomTypeAdminListResponse = z.infer<
  typeof roomTypeAdminListResponseSchema
>;

export class RoomTypeAdminDto extends createZodDto(roomTypeAdminSchema) {}

export class RoomTypeAdminListResponseDto extends createZodDto(
  roomTypeAdminListResponseSchema,
) {}
