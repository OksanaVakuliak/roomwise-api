import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { coefficientGroupSchema } from './coefficient-input.schema';

export const coefficientListQuerySchema = z.object({
  group: coefficientGroupSchema.optional(),
});

export type CoefficientListQuery = z.infer<typeof coefficientListQuerySchema>;

export class CoefficientListQueryDto extends createZodDto(
  coefficientListQuerySchema,
) {}
