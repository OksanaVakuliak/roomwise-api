import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const baseRateIdParamSchema = z.object({
  id: z.uuid(),
});

export class BaseRateIdParamDto extends createZodDto(baseRateIdParamSchema) {}
