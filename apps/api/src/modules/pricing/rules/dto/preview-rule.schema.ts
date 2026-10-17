import { RulePreviewSchema, RuleSampleSchema } from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { validateFormulasSchema } from './validate-formulas.schema';

export const previewRuleSchema = validateFormulasSchema.extend({
  sample: RuleSampleSchema,
});

export type PreviewRuleInput = z.infer<typeof previewRuleSchema>;

export class PreviewRuleDto extends createZodDto(previewRuleSchema) {}

export class RulePreviewDto extends createZodDto(RulePreviewSchema) {}
