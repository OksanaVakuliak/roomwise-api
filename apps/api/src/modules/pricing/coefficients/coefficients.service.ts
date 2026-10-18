import { Inject, Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { Prisma } from '../../../generated/prisma/client';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import type {
  CoefficientAdmin,
  CoefficientListResponse,
  CoefficientUsage,
} from './dto/coefficient-admin.schema';
import type { CoefficientInput } from './dto/coefficient-input.schema';
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

@Injectable()
export class CoefficientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingDataService)
    private readonly pricingData: PricingDataService,
  ) {}

  async list(): Promise<CoefficientListResponse> {
    const [rows, rules] = await Promise.all([
      this.prisma.coefficient.findMany({
        include: COEFFICIENT_ADMIN_INCLUDE,
        orderBy: { key: 'asc' },
      }),
      this.prisma.pricingRule.findMany({
        where: { coefficientKeys: { isEmpty: false } },
        select: { id: true, name: true, coefficientKeys: true },
      }),
    ]);

    return {
      items: rows.map((row) =>
        this.present(
          row,
          toUsage(
            rules.filter((rule) => rule.coefficientKeys.includes(row.key)),
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
          updatedById: adminId,
        },
        include: COEFFICIENT_ADMIN_INCLUDE,
      });
    } catch (error) {
      throw this.mapKeyTaken(error, input.key);
    }

    this.pricingData.invalidate();

    return this.present(created, []);
  }

  async update(
    id: string,
    input: UpdateCoefficientInput,
    adminId: string,
  ): Promise<CoefficientAdmin> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.lockKey(tx, id);

        if (input.key !== undefined && input.key !== existingKey) {
          await this.assertNotInUse(tx, existingKey);
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
      const key = await this.lockKey(tx, id);

      await this.assertNotInUse(tx, key);
      await tx.coefficient.delete({ where: { id } });
    });

    this.pricingData.invalidate();
  }

  private async lockKey(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "coefficients" WHERE "id" = ${id}::uuid FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return rows[0].key;
  }

  private async assertNotInUse(
    tx: Prisma.TransactionClient,
    key: string,
  ): Promise<void> {
    const rules = await tx.pricingRule.findMany({
      where: { coefficientKeys: { has: key } },
      select: { id: true, name: true },
    });

    if (rules.length > 0) {
      throw new AppError(ERROR_CODES.COEFFICIENT_IN_USE, {
        params: { rules: toUsage(rules) },
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
  ): CoefficientAdmin {
    return {
      id: row.id,
      key: row.key,
      name: toLocalizedText(row.name),
      value: row.value.toNumber(),
      unit: toLocalizedText(row.unit),
      usedBy,
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

    const rules = await this.prisma.pricingRule.findMany({
      where: { coefficientKeys: { has: row.key } },
      select: { id: true, name: true },
    });

    return this.present(row, toUsage(rules));
  }
}
