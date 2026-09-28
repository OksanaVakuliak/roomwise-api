import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const productIdParamSchema = z.object({
  id: z.uuid(),
});

export class ProductIdParamDto extends createZodDto(productIdParamSchema) {}
