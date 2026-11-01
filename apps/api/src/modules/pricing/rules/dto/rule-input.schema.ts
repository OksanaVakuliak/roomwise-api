import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { RuleLevel, SurfaceKind } from '../../../../generated/prisma/enums';

export const FORMULA_MAX_LENGTH = 500;

export const formulaSchema = z.string().min(1).max(FORMULA_MAX_LENGTH);

export const ruleSurfaceSchema = z.enum([
  SurfaceKind.FLOOR,
  SurfaceKind.WALLS,
  SurfaceKind.CEILING,
]);

export type RuleSurface = z.infer<typeof ruleSurfaceSchema>;

export interface FormulaShape {
  level: RuleLevel;
  quantityFormula?: string | null;
  laborFormula?: string | null;
}

export interface RuleShape extends FormulaShape {
  categoryId?: string | null;
  materialTypeId?: string | null;
  surface?: RuleSurface | null;
  baseComponent?: boolean;
}

export interface RuleShapeIssue {
  path:
    | 'categoryId'
    | 'materialTypeId'
    | 'surface'
    | 'quantityFormula'
    | 'laborFormula'
    | 'baseComponent';
  message: string;
}

function expectField(
  issues: RuleShapeIssue[],
  level: RuleLevel,
  path: RuleShapeIssue['path'],
  value: unknown,
  required: boolean,
): void {
  const present = value !== undefined && value !== null && value !== false;

  if (required && !present) {
    issues.push({ path, message: `${path} is required for ${level}` });
  }

  if (!required && present) {
    issues.push({ path, message: `${path} is not allowed for ${level}` });
  }
}

const isPricedLevel = (level: RuleLevel): boolean =>
  level === RuleLevel.CATEGORY || level === RuleLevel.MATERIAL_TYPE;

export function findFormulaShapeIssues(rule: FormulaShape): RuleShapeIssue[] {
  const issues: RuleShapeIssue[] = [];

  expectField(
    issues,
    rule.level,
    'quantityFormula',
    rule.quantityFormula,
    isPricedLevel(rule.level),
  );
  expectField(
    issues,
    rule.level,
    'laborFormula',
    isPricedLevel(rule.level) ? undefined : rule.laborFormula,
    false,
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
    isPricedLevel(rule.level),
  );
  expectField(
    issues,
    rule.level,
    'materialTypeId',
    rule.materialTypeId,
    rule.level === RuleLevel.MATERIAL_TYPE,
  );
  expectField(
    issues,
    rule.level,
    'surface',
    rule.surface,
    rule.level === RuleLevel.SURFACE,
  );
  expectField(
    issues,
    rule.level,
    'baseComponent',
    rule.level === RuleLevel.OBJECT ? undefined : rule.baseComponent,
    false,
  );

  return [...issues, ...findFormulaShapeIssues(rule)];
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
    surface: ruleSurfaceSchema.nullable().optional(),
    name: localizedNameDraftSchema,
    quantityFormula: formulaSchema.nullable().optional(),
    costFormula: formulaSchema,
    laborFormula: formulaSchema.nullable().optional(),
    baseComponent: z.boolean().default(false),
  })
  .superRefine((rule, context) => {
    addShapeIssues(findRuleShapeIssues(rule), context);
  });

export type RuleInput = z.infer<typeof ruleInputSchema>;

export class RuleInputDto extends createZodDto(ruleInputSchema) {}
