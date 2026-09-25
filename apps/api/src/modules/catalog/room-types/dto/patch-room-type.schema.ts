import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameSchema } from '../../../../common/i18n/localized-text.schema';

export const patchRoomTypeSchema = z.object({
  name: localizedNameSchema,
  revision: z.uuid(),
});

export type PatchRoomTypeInput = z.infer<typeof patchRoomTypeSchema>;

export class PatchRoomTypeDto extends createZodDto(patchRoomTypeSchema) {}
