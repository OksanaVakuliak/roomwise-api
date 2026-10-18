import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';

export const COEFFICIENT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
export const COEFFICIENT_VALUE_MAX = 99_999_999.9999;

export const coefficientKeySchema = z.string().regex(COEFFICIENT_KEY_PATTERN);
export const coefficientValueSchema = z
  .number()
  .min(0)
  .max(COEFFICIENT_VALUE_MAX);

export const coefficientInputSchema = z
  .object({
    key: coefficientKeySchema,
    name: localizedNameDraftSchema,
    value: coefficientValueSchema,
    unit: localizedNameDraftSchema,
  })
  .strict();

export type CoefficientInput = z.infer<typeof coefficientInputSchema>;

export class CoefficientInputDto extends createZodDto(coefficientInputSchema) {}
