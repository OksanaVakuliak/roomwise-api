import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LOCALIZED_DESCRIPTION_MAX_LENGTH } from '../../../../common/i18n/localized-text.schema';
import { imageRefSchema } from './image-ref.schema';

export const publicStyleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().max(LOCALIZED_DESCRIPTION_MAX_LENGTH),
  image: imageRefSchema.nullable(),
});

export const publicStylesResponseSchema = z.object({
  items: z.array(publicStyleSchema),
});

export type PublicStyle = z.infer<typeof publicStyleSchema>;
export type PublicStylesResponse = z.infer<typeof publicStylesResponseSchema>;

export class PublicStylesResponseDto extends createZodDto(
  publicStylesResponseSchema,
) {}
