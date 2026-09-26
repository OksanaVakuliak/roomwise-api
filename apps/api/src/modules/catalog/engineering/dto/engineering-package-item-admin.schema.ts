import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import {
  OptionUnit,
  PublicationStatus,
} from '../../../../generated/prisma/enums';

export const engineeringPackageItemAdminSchema = z
  .object({
    id: z.uuid(),
    name: localizedNameDraftSchema,
    description: localizedDescriptionDraftSchema,
    includedInBase: z.boolean(),
    priceCents: z.number().int().nonnegative().nullable(),
    unit: z.enum(OptionUnit).nullable(),
    status: z.enum(PublicationStatus),
    sortOrder: z.number().int().nonnegative(),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const engineeringPackageItemAdminListResponseSchema = z.object({
  items: z.array(engineeringPackageItemAdminSchema),
});

export type EngineeringPackageItemAdmin = z.infer<
  typeof engineeringPackageItemAdminSchema
>;
export type EngineeringPackageItemAdminListResponse = z.infer<
  typeof engineeringPackageItemAdminListResponseSchema
>;

export class EngineeringPackageItemAdminDto extends createZodDto(
  engineeringPackageItemAdminSchema,
) {}

export class EngineeringPackageItemAdminListResponseDto extends createZodDto(
  engineeringPackageItemAdminListResponseSchema,
) {}
