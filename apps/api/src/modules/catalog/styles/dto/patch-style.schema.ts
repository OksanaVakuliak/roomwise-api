import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';

export const patchStyleSchema = z.object({
  name: localizedNameDraftSchema.optional(),
  description: localizedDescriptionDraftSchema.optional(),
  imageId: z.uuid().nullable().optional(),
  revision: z.uuid(),
});

export type PatchStyleInput = z.infer<typeof patchStyleSchema>;

export class PatchStyleDto extends createZodDto(patchStyleSchema) {}
