import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { FinishLevel } from '../../../../generated/prisma/enums';
import { areaSchema, rateSchema } from './base-rate-input.schema';

export const updateBaseRateSchema = z
  .object({
    finishLevel: z.enum(FinishLevel).optional(),
    areaFromSqm: areaSchema.optional(),
    areaToSqm: areaSchema.optional(),
    rateCentsPerSqm: rateSchema.optional(),
    revision: z.uuid(),
  })
  .strict();

export type UpdateBaseRateInput = z.infer<typeof updateBaseRateSchema>;

export class UpdateBaseRateDto extends createZodDto(updateBaseRateSchema) {}
