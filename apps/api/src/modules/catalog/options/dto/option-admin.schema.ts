import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import {
  OptionKind,
  OptionUnit,
  PublicationStatus,
} from '../../../../generated/prisma/enums';
import { imageRefSchema } from '../../public/dto/image-ref.schema';

export const optionAdminSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(OptionKind),
    name: localizedNameDraftSchema,
    description: localizedDescriptionDraftSchema,
    image: imageRefSchema.nullable(),
    priceCents: z.number().int().nonnegative(),
    unit: z.enum(OptionUnit),
    perRoom: z.boolean(),
    minQuantity: z.number().int().nullable(),
    maxQuantity: z.number().int().nullable(),
    roomTypeIds: z.array(z.uuid()),
    sortOrder: z.number().int().nonnegative(),
    status: z.enum(PublicationStatus),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const optionAdminListResponseSchema = z.object({
  items: z.array(optionAdminSchema),
});

export type OptionAdmin = z.infer<typeof optionAdminSchema>;
export type OptionAdminListResponse = z.infer<
  typeof optionAdminListResponseSchema
>;

export class OptionAdminDto extends createZodDto(optionAdminSchema) {}

export class OptionAdminListResponseDto extends createZodDto(
  optionAdminListResponseSchema,
) {}
