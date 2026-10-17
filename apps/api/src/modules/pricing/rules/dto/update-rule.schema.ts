import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { formulaSchema } from './rule-input.schema';

export const updateRuleSchema = z
  .object({
    name: localizedNameDraftSchema.optional(),
    quantityFormula: formulaSchema.nullable().optional(),
    costFormula: formulaSchema.optional(),
    revision: z.uuid(),
  })
  .strict();

export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export class UpdateRuleDto extends createZodDto(updateRuleSchema) {}
