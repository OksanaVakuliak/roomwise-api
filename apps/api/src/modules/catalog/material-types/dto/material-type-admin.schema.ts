import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const materialTypeAdminSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: localizedNameDraftSchema,
    status: z.enum(PublicationStatus),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const materialTypeAdminListResponseSchema = z.object({
  items: z.array(materialTypeAdminSchema),
});

export type MaterialTypeAdmin = z.infer<typeof materialTypeAdminSchema>;
export type MaterialTypeAdminListResponse = z.infer<
  typeof materialTypeAdminListResponseSchema
>;

export class MaterialTypeAdminDto extends createZodDto(
  materialTypeAdminSchema,
) {}

export class MaterialTypeAdminListResponseDto extends createZodDto(
  materialTypeAdminListResponseSchema,
) {}
