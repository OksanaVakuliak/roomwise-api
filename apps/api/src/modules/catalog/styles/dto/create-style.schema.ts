import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';

export const createStyleSchema = z.object({
  name: localizedNameDraftSchema,
  description: localizedDescriptionDraftSchema,
  imageId: z.uuid().optional(),
});

export type CreateStyleInput = z.infer<typeof createStyleSchema>;

export class CreateStyleDto extends createZodDto(createStyleSchema) {}
