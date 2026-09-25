import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const updateMaterialTypeSchema = z
  .object({
    name: localizedNameDraftSchema.optional(),
    status: z.enum(PublicationStatus).optional(),
    revision: z.uuid(),
  })
  .strict();

export type UpdateMaterialTypeInput = z.infer<typeof updateMaterialTypeSchema>;

export class UpdateMaterialTypeDto extends createZodDto(
  updateMaterialTypeSchema,
) {}
