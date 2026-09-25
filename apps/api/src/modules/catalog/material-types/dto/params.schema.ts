import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const materialTypeIdParamSchema = z.object({
  id: z.uuid(),
});

export class MaterialTypeIdParamDto extends createZodDto(
  materialTypeIdParamSchema,
) {}
