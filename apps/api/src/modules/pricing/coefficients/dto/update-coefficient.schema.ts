import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { coefficientKeySchema } from '../../../../common/pricing/coefficient-key.schema';
import {
  coefficientGroupSchema,
  coefficientValueSchema,
} from './coefficient-input.schema';

export const updateCoefficientSchema = z
  .object({
    key: coefficientKeySchema.optional(),
    name: localizedNameDraftSchema.optional(),
    value: coefficientValueSchema.optional(),
    unit: localizedNameDraftSchema.optional(),
    group: coefficientGroupSchema.optional(),
    revision: z.uuid(),
  })
  .strict();

export type UpdateCoefficientInput = z.infer<typeof updateCoefficientSchema>;

export class UpdateCoefficientDto extends createZodDto(
  updateCoefficientSchema,
) {}
