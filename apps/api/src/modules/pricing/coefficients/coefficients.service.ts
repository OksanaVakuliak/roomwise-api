import { Inject, Injectable } from '@nestjs/common';
import {
  staleRevisionError,
  updateWithRevision,
} from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { Prisma } from '../../../generated/prisma/client';
import { CatalogPricingReadService } from '../../catalog/pricing-read/catalog-pricing-read.service';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import type {
  CoefficientAdmin,
  CoefficientListResponse,
  CoefficientOptionUsage,
  CoefficientUsage,
} from './dto/coefficient-admin.schema';
import type { CoefficientInput } from './dto/coefficient-input.schema';
import type { CoefficientListQuery } from './dto/coefficient-list-query.schema';
import type { UpdateCoefficientInput } from './dto/update-coefficient.schema';

const COEFFICIENT_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
} satisfies Prisma.CoefficientInclude;

type CoefficientWithRelations = Prisma.CoefficientGetPayload<{
  include: typeof COEFFICIENT_ADMIN_INCLUDE;
}>;

interface RuleUsageRow {
  id: string;
  name: unknown;
}

function toUsage(rules: RuleUsageRow[]): CoefficientUsage[] {
  return rules.map((rule) => ({
    ruleId: rule.id,
    ruleName: toLocalizedText(rule.name),
  }));
}

function toOptionUsage(
  options: Array<{ id: string; name: LocalizedText }>,
): CoefficientOptionUsage[] {
  return options.map((option) => ({
    optionId: option.id,
    optionName: option.name,
  }));
}

@Injectable()
export class CoefficientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingDataService)
    private readonly pricingData: PricingDataService,
    @Inject(CatalogPricingReadService)
    private readonly catalog: CatalogPricingReadService,
  ) {}

  async list(
    group?: CoefficientListQuery['group'],
  ): Promise<CoefficientListResponse> {
    const [rows, rules, options] = await Promise.all([
      this.prisma.coefficient.findMany({
        where: group === undefined ? undefined : { group },
        include: COEFFICIENT_ADMIN_INCLUDE,
        orderBy: { key: 'asc' },
      }),
      this.prisma.pricingRule.findMany({
        where: { coefficientKeys: { isEmpty: false } },
        select: { id: true, name: true, coefficientKeys: true },
      }),
      this.catalog.optionsUsingCoefficients(),
    ]);

    return {
      items: rows.map((row) =>
        this.present(
          row,
          toUsage(
            rules.filter((rule) => rule.coefficientKeys.includes(row.key)),
          ),
          toOptionUsage(
            options.filter((option) => option.keys.includes(row.key)),
          ),
        ),
      ),
    };
  }

  async create(
    input: CoefficientInput,
    adminId: string,
  ): Promise<CoefficientAdmin> {
    let created: CoefficientWithRelations;

    try {
      created = await this.prisma.coefficient.create({
        data: {
          key: input.key,
          name: input.name,
          value: input.value,
          unit: input.unit,
          group: input.group,
          updatedById: adminId,
        },
        include: COEFFICIENT_ADMIN_INCLUDE,
      });
    } catch (error) {
      throw this.mapKeyTaken(error, input.key);
    }

    this.pricingData.invalidate();

    return this.present(created, [], []);
  }

  async update(
    id: string,
    input: UpdateCoefficientInput,
    adminId: string,
  ): Promise<CoefficientAdmin> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await this.lockRow(tx, id);

        if (existing.revision !== input.revision) {
          throw staleRevisionError(existing.revision);
        }

        if (input.key !== undefined && input.key !== existing.key) {
          await this.assertNotInUse(tx, existing.key);
        }

        await updateWithRevision({
          id,
          expectedRevision: input.revision,
          updatedById: adminId,
          update: async ({ id: coefficientId, expectedRevision, mutation }) => {
            const result = await tx.coefficient.updateMany({
              where: { id: coefficientId, revision: expectedRevision },
              data: {
                key: input.key,
                name: input.name,
                value: input.value,
                unit: input.unit,
                group: input.group,
                revision: mutation.revision,
                updatedAt: mutation.updatedAt,
                updatedById: mutation.updatedById,
              },
            });

            return result.count;
          },
          readCurrentRevision: async (coefficientId) => {
            const current = await tx.coefficient.findUnique({
              where: { id: coefficientId },
              select: { revision: true },
            });

            return current?.revision ?? null;
          },
        });
      });
    } catch (error) {
      throw this.mapKeyTaken(error, input.key);
    }

    this.pricingData.invalidate();

    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { key } = await this.lockRow(tx, id);

      await this.assertNotInUse(tx, key);
      await tx.coefficient.delete({ where: { id } });
    });

    this.pricingData.invalidate();
  }

  private async lockRow(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ key: string; revision: string }>>`
      SELECT "key", "revision" FROM "coefficients" WHERE "id" = ${id}::uuid FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return rows[0];
  }

  private async assertNotInUse(
    tx: Prisma.TransactionClient,
    key: string,
  ): Promise<void> {
    const rules = await tx.pricingRule.findMany({
      where: { coefficientKeys: { has: key } },
      select: { id: true, name: true },
    });
    const options = await this.catalog.optionsUsingCoefficient(key, tx);

    if (rules.length > 0 || options.length > 0) {
      throw new AppError(ERROR_CODES.COEFFICIENT_IN_USE, {
        params: { rules: toUsage(rules), options: toOptionUsage(options) },
      });
    }
  }

  private mapKeyTaken(error: unknown, key: string | undefined): unknown {
    if (isPrismaError(error, 'P2002')) {
      return new AppError(ERROR_CODES.KEY_TAKEN, { params: { key } });
    }

    return error;
  }

  private present(
    row: CoefficientWithRelations,
    usedBy: CoefficientUsage[],
    usedByOptions: CoefficientOptionUsage[],
  ): CoefficientAdmin {
    return {
      id: row.id,
      key: row.key,
      name: toLocalizedText(row.name),
      value: row.value.toNumber(),
      unit: toLocalizedText(row.unit),
      group: row.group,
      usedBy,
      usedByOptions,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  private async getById(id: string): Promise<CoefficientAdmin> {
    const row = await this.prisma.coefficient.findUnique({
      where: { id },
      include: COEFFICIENT_ADMIN_INCLUDE,
    });

    if (!row) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const [rules, options] = await Promise.all([
      this.prisma.pricingRule.findMany({
        where: { coefficientKeys: { has: row.key } },
        select: { id: true, name: true },
      }),
      this.catalog.optionsUsingCoefficient(row.key),
    ]);

    return this.present(row, toUsage(rules), toOptionUsage(options));
  }
}
