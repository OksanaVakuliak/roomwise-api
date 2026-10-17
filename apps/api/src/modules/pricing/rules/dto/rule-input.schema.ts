import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { RuleLevel } from '../../../../generated/prisma/enums';

export const FORMULA_MAX_LENGTH = 500;

export const formulaSchema = z.string().min(1).max(FORMULA_MAX_LENGTH);

export interface RuleShape {
  level: RuleLevel;
  categoryId?: string | null;
  materialTypeId?: string | null;
  quantityFormula?: string | null;
}

export interface RuleShapeIssue {
  path: 'categoryId' | 'materialTypeId' | 'quantityFormula';
  message: string;
}

function expectField(
  issues: RuleShapeIssue[],
  level: RuleLevel,
  path: RuleShapeIssue['path'],
  value: string | null | undefined,
  required: boolean,
): void {
  const present = value !== undefined && value !== null;

  if (required && !present) {
    issues.push({ path, message: `${path} is required for ${level}` });
  }

  if (!required && present) {
    issues.push({ path, message: `${path} is not allowed for ${level}` });
  }
}

export function findQuantityFormulaIssues(
  rule: Pick<RuleShape, 'level' | 'quantityFormula'>,
): RuleShapeIssue[] {
  const issues: RuleShapeIssue[] = [];

  expectField(
    issues,
    rule.level,
    'quantityFormula',
    rule.quantityFormula,
    rule.level !== RuleLevel.OBJECT,
  );

  return issues;
}

export function findRuleShapeIssues(rule: RuleShape): RuleShapeIssue[] {
  const issues: RuleShapeIssue[] = [];

  expectField(
    issues,
    rule.level,
    'categoryId',
    rule.categoryId,
    rule.level !== RuleLevel.OBJECT,
  );
  expectField(
    issues,
    rule.level,
    'materialTypeId',
    rule.materialTypeId,
    rule.level === RuleLevel.MATERIAL_TYPE,
  );

  return [...issues, ...findQuantityFormulaIssues(rule)];
}

export function addShapeIssues(
  issues: RuleShapeIssue[],
  context: z.RefinementCtx,
): void {
  for (const issue of issues) {
    context.addIssue({
      code: 'custom',
      path: [issue.path],
      message: issue.message,
    });
  }
}

export const ruleInputSchema = z
  .object({
    level: z.enum(RuleLevel),
    categoryId: z.uuid().nullable().optional(),
    materialTypeId: z.uuid().nullable().optional(),
    name: localizedNameDraftSchema,
    quantityFormula: formulaSchema.nullable().optional(),
    costFormula: formulaSchema,
  })
  .superRefine((rule, context) => {
    addShapeIssues(findRuleShapeIssues(rule), context);
  });

export type RuleInput = z.infer<typeof ruleInputSchema>;

export class RuleInputDto extends createZodDto(ruleInputSchema) {}
