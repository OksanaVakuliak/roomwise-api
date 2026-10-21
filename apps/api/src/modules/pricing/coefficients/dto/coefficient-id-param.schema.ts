import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const coefficientIdParamSchema = z.object({
  id: z.uuid(),
});

export class CoefficientIdParamDto extends createZodDto(
  coefficientIdParamSchema,
) {}
