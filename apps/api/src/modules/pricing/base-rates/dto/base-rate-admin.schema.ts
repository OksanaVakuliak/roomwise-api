import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { FinishLevel } from '../../../../generated/prisma/enums';

export const baseRateAdminSchema = z
  .object({
    id: z.uuid(),
    finishLevel: z.enum(FinishLevel),
    areaFromSqm: z.number(),
    areaToSqm: z.number(),
    rateCentsPerSqm: z.int(),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const baseRateGapSchema = z.object({
  finishLevel: z.enum(FinishLevel),
  fromSqm: z.number(),
  toSqm: z.number(),
});

export const baseRateListResponseSchema = z.object({
  items: z.array(baseRateAdminSchema),
  gaps: z.array(baseRateGapSchema),
});

export type BaseRateAdmin = z.infer<typeof baseRateAdminSchema>;
export type BaseRateGap = z.infer<typeof baseRateGapSchema>;
export type BaseRateListResponse = z.infer<typeof baseRateListResponseSchema>;

export class BaseRateAdminDto extends createZodDto(baseRateAdminSchema) {}

export class BaseRateListResponseDto extends createZodDto(
  baseRateListResponseSchema,
) {}
