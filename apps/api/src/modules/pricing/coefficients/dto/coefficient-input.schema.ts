import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { coefficientKeySchema } from '../../../../common/pricing/coefficient-key.schema';
import { CoefficientGroup } from '../../../../generated/prisma/enums';

export const COEFFICIENT_VALUE_MAX = 99_999_999.9999;
export const COEFFICIENT_VALUE_STEP = 0.0001;

export const coefficientGroupSchema = z.enum(CoefficientGroup);

export const coefficientValueSchema = z
  .number()
  .min(0)
  .max(COEFFICIENT_VALUE_MAX)
  .multipleOf(COEFFICIENT_VALUE_STEP);

export const coefficientInputSchema = z
  .object({
    key: coefficientKeySchema,
    name: localizedNameDraftSchema,
    value: coefficientValueSchema,
    unit: localizedNameDraftSchema,
    group: coefficientGroupSchema.default(CoefficientGroup.MATERIAL_EXTRA),
  })
  .strict();

export type CoefficientInput = z.infer<typeof coefficientInputSchema>;

export class CoefficientInputDto extends createZodDto(coefficientInputSchema) {}
