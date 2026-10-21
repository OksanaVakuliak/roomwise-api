import { RulePreviewSchema, RuleSampleSchema } from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  refineQuantityFormula,
  validateFormulasBaseSchema,
} from './validate-formulas.schema';

export const previewRuleSchema = validateFormulasBaseSchema
  .extend({ sample: RuleSampleSchema })
  .superRefine(refineQuantityFormula);

export type PreviewRuleInput = z.infer<typeof previewRuleSchema>;

export class PreviewRuleDto extends createZodDto(previewRuleSchema) {}

export class RulePreviewDto extends createZodDto(RulePreviewSchema) {}
