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

export function findRuleShapeIssues(rule: RuleShape): RuleShapeIssue[] {
  const issues: RuleShapeIssue[] = [];
  const expect = (
    path: RuleShapeIssue['path'],
    value: string | null | undefined,
    required: boolean,
  ) => {
    const present = value !== undefined && value !== null;

    if (required && !present) {
      issues.push({ path, message: `${path} is required for ${rule.level}` });
    }

    if (!required && present) {
      issues.push({
        path,
        message: `${path} is not allowed for ${rule.level}`,
      });
    }
  };

  expect('categoryId', rule.categoryId, rule.level !== RuleLevel.OBJECT);
  expect(
    'materialTypeId',
    rule.materialTypeId,
    rule.level === RuleLevel.MATERIAL_TYPE,
  );
  expect(
    'quantityFormula',
    rule.quantityFormula,
    rule.level !== RuleLevel.OBJECT,
  );

  return issues;
}

export const ruleInputSchema = z
  .object({
    level: z.enum(RuleLevel),
    categoryId: z.uuid().optional(),
    materialTypeId: z.uuid().optional(),
    name: localizedNameDraftSchema,
    quantityFormula: formulaSchema.nullable().optional(),
    costFormula: formulaSchema,
  })
  .superRefine((rule, context) => {
    for (const issue of findRuleShapeIssues(rule)) {
      context.addIssue({
        code: 'custom',
        path: [issue.path],
        message: issue.message,
      });
    }
  });

export type RuleInput = z.infer<typeof ruleInputSchema>;

export class RuleInputDto extends createZodDto(ruleInputSchema) {}
