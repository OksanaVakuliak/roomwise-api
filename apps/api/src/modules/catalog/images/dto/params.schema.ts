import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const imageIdParamSchema = z.object({
  id: z.uuid(),
});

export class ImageIdParamDto extends createZodDto(imageIdParamSchema) {}
