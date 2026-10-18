import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { FinishLevel } from '../../../../generated/prisma/enums';

export const AREA_STEP = 0.01;
export const AREA_MAX = 99999.99;
export const RATE_MAX = 2147483647;

export const areaSchema = z.number().min(0).max(AREA_MAX).multipleOf(AREA_STEP);
export const rateSchema = z.int().positive().max(RATE_MAX);

export const baseRateInputSchema = z
  .object({
    finishLevel: z.enum(FinishLevel),
    areaFromSqm: areaSchema,
    areaToSqm: areaSchema,
    rateCentsPerSqm: rateSchema,
  })
  .strict()
  .refine((value) => value.areaToSqm > value.areaFromSqm, {
    path: ['areaToSqm'],
    error: 'areaToSqm must be greater than areaFromSqm',
  });

export type BaseRateInput = z.infer<typeof baseRateInputSchema>;

export class BaseRateInputDto extends createZodDto(baseRateInputSchema) {}
