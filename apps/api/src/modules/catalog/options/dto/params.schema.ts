import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const optionIdParamSchema = z.object({
  id: z.uuid(),
});

export class OptionIdParamDto extends createZodDto(optionIdParamSchema) {}
