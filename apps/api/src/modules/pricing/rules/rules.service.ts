import { Inject, Injectable } from '@nestjs/common';
import {
  previewRule,
  type RulePreview,
  validateFormula,
} from '@roomwise/calc-engine';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { Prisma } from '../../../generated/prisma/client';
import { RuleLevel } from '../../../generated/prisma/enums';
import { CatalogPricingReadService } from '../../catalog/pricing-read/catalog-pricing-read.service';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import type { PreviewRuleInput } from './dto/preview-rule.schema';
import type { RuleAdmin, RuleListResponse } from './dto/rule-admin.schema';
import { findRuleShapeIssues, type RuleInput } from './dto/rule-input.schema';
import type { RuleOrderInput } from './dto/rule-order.schema';
import type { UpdateRuleInput } from './dto/update-rule.schema';
import type {
  FormulaIssue,
  ValidateFormulasInput,
  ValidateFormulasResponse,
} from './dto/validate-formulas.schema';

const RULE_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
} satisfies Prisma.PricingRuleInclude;

type RuleWithRelations = Prisma.PricingRuleGetPayload<{
  include: typeof RULE_ADMIN_INCLUDE;
}>;

const LEVEL_ORDER: Record<RuleLevel, number> = {
  OBJECT: 0,
  CATEGORY: 1,
  MATERIAL_TYPE: 2,
};

function compareRules(
  left: RuleWithRelations,
  right: RuleWithRelations,
): number {
  return (
    LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level] ||
    left.sortOrder - right.sortOrder ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function definedIds(values: Array<string | null>): string[] {
  return uniqueSorted(values.filter((value) => value !== null));
}

@Injectable()
export class RulesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogPricingReadService)
    private readonly catalog: CatalogPricingReadService,
    @Inject(PricingDataService)
    private readonly pricingData: PricingDataService,
  ) {}

  async list(): Promise<RuleListResponse> {
    const [rows, categories] = await Promise.all([
      this.prisma.pricingRule.findMany({ include: RULE_ADMIN_INCLUDE }),
      this.catalog.categorySummaries(),
    ]);
    const items = await this.present(rows.sort(compareRules));
    const ruledCategoryIds = new Set(
      items
        .filter((item) => item.level === RuleLevel.CATEGORY && !item.orphaned)
        .map((item) => item.categoryId),
    );

    return {
      items,
      categoriesWithoutRule: categories.filter(
        (category) => !ruledCategoryIds.has(category.id),
      ),
    };
  }

  async create(input: RuleInput, adminId: string): Promise<RuleAdmin> {
    const categoryId = input.categoryId ?? null;
    const materialTypeId = input.materialTypeId ?? null;
    const quantityFormula = input.quantityFormula ?? null;

    await this.assertReferencesExist(categoryId, materialTypeId);
    const coefficientKeys = this.assertFormulasValid(
      input.level,
      quantityFormula,
      input.costFormula,
      await this.pricingData.coefficients(),
    );
    await this.assertNotDuplicate(input.level, categoryId, materialTypeId);

    const sortOrder =
      input.level === RuleLevel.OBJECT ? await this.nextObjectSortOrder() : 0;

    let created: RuleWithRelations;

    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.lockCoefficients(
          tx,
          coefficientKeys,
          input.level,
          quantityFormula,
          input.costFormula,
        );

        return tx.pricingRule.create({
          data: {
            level: input.level,
            categoryId,
            materialTypeId,
            name: input.name,
            quantityFormula,
            costFormula: input.costFormula,
            coefficientKeys,
            sortOrder,
            updatedById: adminId,
          },
          include: RULE_ADMIN_INCLUDE,
        });
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new AppError(ERROR_CODES.RULE_EXISTS, {
          params: { categoryId, materialTypeId },
        });
      }

      throw error;
    }

    this.pricingData.invalidate();

    return this.presentOne(created);
  }

  async update(
    id: string,
    input: UpdateRuleInput,
    adminId: string,
  ): Promise<RuleAdmin> {
    const existing = await this.prisma.pricingRule.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const name = input.name ?? toLocalizedText(existing.name);
    const quantityFormula =
      input.quantityFormula !== undefined
        ? input.quantityFormula
        : existing.quantityFormula;
    const costFormula = input.costFormula ?? existing.costFormula;

    const shapeIssues = findRuleShapeIssues({
      level: existing.level,
      categoryId: existing.categoryId,
      materialTypeId: existing.materialTypeId,
      quantityFormula,
    });

    if (shapeIssues.length > 0) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        fields: shapeIssues.map((issue) => ({
          path: issue.path,
          code: 'custom',
          params: { message: issue.message },
        })),
      });
    }

    const coefficientKeys = this.assertFormulasValid(
      existing.level,
      quantityFormula,
      costFormula,
      await this.pricingData.coefficients(),
    );

    await this.prisma.$transaction(async (tx) => {
      await this.lockCoefficients(
        tx,
        coefficientKeys,
        existing.level,
        quantityFormula,
        costFormula,
      );

      await updateWithRevision({
        id,
        expectedRevision: input.revision,
        updatedById: adminId,
        update: async ({ id: ruleId, expectedRevision, mutation }) => {
          const result = await tx.pricingRule.updateMany({
            where: { id: ruleId, revision: expectedRevision },
            data: {
              name,
              quantityFormula,
              costFormula,
              coefficientKeys,
              revision: mutation.revision,
              updatedAt: mutation.updatedAt,
              updatedById: mutation.updatedById,
            },
          });

          return result.count;
        },
        readCurrentRevision: (ruleId) => this.readRevision(ruleId, tx),
      });
    });

    this.pricingData.invalidate();

    return this.getById(id);
  }

  async reorder(input: RuleOrderInput, adminId: string): Promise<void> {
    const existing = await this.prisma.pricingRule.findMany({
      where: { level: RuleLevel.OBJECT },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((rule) => rule.id));
    const providedIds = new Set(input.ids);

    const isMismatched =
      providedIds.size !== input.ids.length ||
      providedIds.size !== existingIds.size ||
      input.ids.some((id) => !existingIds.has(id));

    if (isMismatched) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        params: { ids: input.ids },
      });
    }

    const updatedAt = new Date();

    try {
      await this.prisma.$transaction(
        input.ids.map((id, index) =>
          this.prisma.pricingRule.update({
            where: { id },
            data: { sortOrder: index, updatedAt, updatedById: adminId },
          }),
        ),
      );
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          params: { ids: input.ids },
        });
      }

      throw error;
    }

    this.pricingData.invalidate();
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.pricingRule.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      throw error;
    }

    this.pricingData.invalidate();
  }

  async validate(
    input: ValidateFormulasInput,
  ): Promise<ValidateFormulasResponse> {
    return this.checkFormulas(
      input.level,
      input.quantityFormula ?? null,
      input.costFormula,
      await this.pricingData.coefficients(),
    );
  }

  async preview(input: PreviewRuleInput): Promise<RulePreview> {
    const quantityFormula = input.quantityFormula ?? null;
    const coefficients = await this.pricingData.coefficients();

    this.assertFormulasValid(
      input.level,
      quantityFormula,
      input.costFormula,
      coefficients,
    );

    return previewRule({
      level: input.level,
      quantityFormula,
      costFormula: input.costFormula,
      coefficients,
      sample: input.sample,
    });
  }

  private checkFormulas(
    level: RuleLevel,
    quantityFormula: string | null,
    costFormula: string,
    coefficients: Record<string, number>,
  ): ValidateFormulasResponse {
    const known = Object.keys(coefficients);
    const errors: FormulaIssue[] = [];
    const used: string[] = [];
    const formulas: Array<['quantity' | 'cost', string | null]> = [
      ['quantity', quantityFormula],
      ['cost', costFormula],
    ];

    for (const [formula, source] of formulas) {
      if (source === null) {
        continue;
      }

      const result = validateFormula({
        level,
        kind: formula,
        source,
        coefficientKeys: known,
      });

      used.push(...result.coefficientKeys);
      errors.push(...result.errors.map((error) => ({ formula, ...error })));
    }

    return {
      valid: errors.length === 0,
      coefficientKeys: uniqueSorted(used),
      errors,
    };
  }

  private assertFormulasValid(
    level: RuleLevel,
    quantityFormula: string | null,
    costFormula: string,
    coefficients: Record<string, number>,
  ): string[] {
    const result = this.checkFormulas(
      level,
      quantityFormula,
      costFormula,
      coefficients,
    );

    if (!result.valid) {
      throw new AppError(ERROR_CODES.FORMULA_INVALID, {
        params: { errors: result.errors },
      });
    }

    return result.coefficientKeys;
  }

  private async lockCoefficients(
    tx: Prisma.TransactionClient,
    keys: string[],
    level: RuleLevel,
    quantityFormula: string | null,
    costFormula: string,
  ): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    const rows = await tx.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "coefficients" WHERE "key" = ANY(${keys}) FOR SHARE
    `;

    if (rows.length < keys.length) {
      this.assertFormulasValid(
        level,
        quantityFormula,
        costFormula,
        Object.fromEntries(rows.map((row) => [row.key, 0])),
      );
    }
  }

  private async assertReferencesExist(
    categoryId: string | null,
    materialTypeId: string | null,
  ): Promise<void> {
    const [categoryIds, materialTypeIds] = await Promise.all([
      this.catalog.existingCategoryIds(definedIds([categoryId])),
      this.catalog.existingMaterialTypeIds(definedIds([materialTypeId])),
    ]);
    const references: Array<{ field: string; id: string }> = [];

    if (categoryId !== null && !categoryIds.has(categoryId)) {
      references.push({ field: 'categoryId', id: categoryId });
    }

    if (materialTypeId !== null && !materialTypeIds.has(materialTypeId)) {
      references.push({ field: 'materialTypeId', id: materialTypeId });
    }

    if (references.length > 0) {
      throw new AppError(ERROR_CODES.UNKNOWN_REFERENCE, {
        params: { references },
      });
    }
  }

  private async assertNotDuplicate(
    level: RuleLevel,
    categoryId: string | null,
    materialTypeId: string | null,
  ): Promise<void> {
    if (level === RuleLevel.OBJECT) {
      return;
    }

    const duplicate = await this.prisma.pricingRule.findFirst({
      where: { level, categoryId, materialTypeId },
      select: { id: true },
    });

    if (duplicate) {
      throw new AppError(ERROR_CODES.RULE_EXISTS, {
        params: { categoryId, materialTypeId },
      });
    }
  }

  private async nextObjectSortOrder(): Promise<number> {
    const result = await this.prisma.pricingRule.aggregate({
      where: { level: RuleLevel.OBJECT },
      _max: { sortOrder: true },
    });

    return (result._max.sortOrder ?? -1) + 1;
  }

  private async present(rows: RuleWithRelations[]): Promise<RuleAdmin[]> {
    const [categoryIds, materialTypeIds] = await Promise.all([
      this.catalog.existingCategoryIds(
        definedIds(rows.map((row) => row.categoryId)),
      ),
      this.catalog.existingMaterialTypeIds(
        definedIds(rows.map((row) => row.materialTypeId)),
      ),
    ]);

    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      categoryId: row.categoryId,
      materialTypeId: row.materialTypeId,
      name: toLocalizedText(row.name),
      quantityFormula: row.quantityFormula,
      costFormula: row.costFormula,
      coefficientKeys: row.coefficientKeys,
      sortOrder: row.sortOrder,
      orphaned:
        (row.categoryId !== null && !categoryIds.has(row.categoryId)) ||
        (row.materialTypeId !== null &&
          !materialTypeIds.has(row.materialTypeId)),
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    }));
  }

  private async presentOne(row: RuleWithRelations): Promise<RuleAdmin> {
    const [rule] = await this.present([row]);

    return rule;
  }

  private async readRevision(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    const rule = await client.pricingRule.findUnique({
      where: { id },
      select: { revision: true },
    });

    return rule?.revision ?? null;
  }

  private async getById(id: string): Promise<RuleAdmin> {
    const rule = await this.prisma.pricingRule.findUnique({
      where: { id },
      include: RULE_ADMIN_INCLUDE,
    });

    if (!rule) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return this.presentOne(rule);
  }
}
