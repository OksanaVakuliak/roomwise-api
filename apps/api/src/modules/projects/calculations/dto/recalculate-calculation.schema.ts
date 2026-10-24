import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const recalculateCalculationRequestSchema = z.object({
  basedOnVersion: z.number().int().min(1),
});

export class RecalculateCalculationRequestDto extends createZodDto(
  recalculateCalculationRequestSchema,
) {}
