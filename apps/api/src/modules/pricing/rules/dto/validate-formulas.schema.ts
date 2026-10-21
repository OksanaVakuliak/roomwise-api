import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RuleLevel } from '../../../../generated/prisma/enums';
import {
  addShapeIssues,
  findQuantityFormulaIssues,
  formulaSchema,
} from './rule-input.schema';

export const validateFormulasBaseSchema = z.object({
  level: z.enum(RuleLevel),
  quantityFormula: formulaSchema.nullable().optional(),
  costFormula: formulaSchema,
});

export function refineQuantityFormula(
  rule: z.infer<typeof validateFormulasBaseSchema>,
  context: z.RefinementCtx,
): void {
  addShapeIssues(findQuantityFormulaIssues(rule), context);
}

export const validateFormulasSchema = validateFormulasBaseSchema.superRefine(
  refineQuantityFormula,
);

export const formulaIssueSchema = z.object({
  formula: z.enum(['quantity', 'cost']),
  code: z.string(),
  position: z.int(),
  length: z.int(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export const validateFormulasResponseSchema = z.object({
  valid: z.boolean(),
  coefficientKeys: z.array(z.string()),
  errors: z.array(formulaIssueSchema),
});

export type ValidateFormulasInput = z.infer<typeof validateFormulasSchema>;
export type FormulaIssue = z.infer<typeof formulaIssueSchema>;
export type ValidateFormulasResponse = z.infer<
  typeof validateFormulasResponseSchema
>;

export class ValidateFormulasDto extends createZodDto(validateFormulasSchema) {}

export class ValidateFormulasResponseDto extends createZodDto(
  validateFormulasResponseSchema,
) {}
