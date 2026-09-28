import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const styleIdParamSchema = z.object({
  id: z.uuid(),
});

export class StyleIdParamDto extends createZodDto(styleIdParamSchema) {}
