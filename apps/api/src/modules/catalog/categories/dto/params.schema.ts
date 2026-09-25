import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const categoryIdParamSchema = z.object({
  id: z.uuid(),
});

export class CategoryIdParamDto extends createZodDto(categoryIdParamSchema) {}
