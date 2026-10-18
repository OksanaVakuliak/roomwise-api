import { Inject, Injectable } from '@nestjs/common';
import {
  staleRevisionError,
  updateWithRevision,
} from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { Prisma } from '../../../generated/prisma/client';
import { FinishLevel } from '../../../generated/prisma/enums';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import type {
  BaseRateAdmin,
  BaseRateGap,
  BaseRateListResponse,
} from './dto/base-rate-admin.schema';
import type { BaseRateInput } from './dto/base-rate-input.schema';
import type { UpdateBaseRateInput } from './dto/update-base-rate.schema';

const BASE_RATES_LOCK_KEY = 2002001;
const AREA_FRACTION_DIGITS = 2;

const BASE_RATE_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
} satisfies Prisma.BaseRateInclude;

type BaseRateWithRelations = Prisma.BaseRateGetPayload<{
  include: typeof BASE_RATE_ADMIN_INCLUDE;
}>;

interface Range {
  areaFromSqm: number;
  areaToSqm: number;
}

function roundArea(value: number): number {
  return Number(value.toFixed(AREA_FRACTION_DIGITS));
}

function overlaps(left: Range, right: Range): boolean {
  return (
    left.areaFromSqm < right.areaToSqm && right.areaFromSqm < left.areaToSqm
  );
}

function computeGaps(
  rows: BaseRateWithRelations[],
  min: number,
  max: number,
): BaseRateGap[] {
  const gaps: BaseRateGap[] = [];

  for (const finishLevel of Object.values(FinishLevel)) {
    const ranges = rows
      .filter((row) => row.finishLevel === finishLevel)
      .map((row) => ({
        from: row.areaFromSqm.toNumber(),
        to: row.areaToSqm.toNumber(),
      }))
      .sort((left, right) => left.from - right.from);
    let cursor = min;

    for (const range of ranges) {
      if (cursor > max) {
        break;
      }

      if (range.from > cursor) {
        gaps.push({
          finishLevel,
          fromSqm: roundArea(cursor),
          toSqm: roundArea(Math.min(range.from, max)),
        });
      }

      cursor = Math.max(cursor, range.to);
    }

    if (cursor <= max) {
      gaps.push({
        finishLevel,
        fromSqm: roundArea(cursor),
        toSqm: roundArea(max),
      });
    }
  }

  return gaps;
}

function present(row: BaseRateWithRelations): BaseRateAdmin {
  return {
    id: row.id,
    finishLevel: row.finishLevel,
    areaFromSqm: row.areaFromSqm.toNumber(),
    areaToSqm: row.areaToSqm.toNumber(),
    rateCentsPerSqm: row.rateCentsPerSqm,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

@Injectable()
export class BaseRatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingDataService)
    private readonly pricingData: PricingDataService,
  ) {}

  async list(): Promise<BaseRateListResponse> {
    const [rows, data] = await Promise.all([
      this.prisma.baseRate.findMany({
        include: BASE_RATE_ADMIN_INCLUDE,
        orderBy: [{ finishLevel: 'asc' }, { areaFromSqm: 'asc' }],
      }),
      this.pricingData.get(),
    ]);
    const { min, max } = data.limits.totalAreaSqm;

    return { items: rows.map(present), gaps: computeGaps(rows, min, max) };
  }

  async create(input: BaseRateInput, adminId: string): Promise<BaseRateAdmin> {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      await this.assertNoOverlap(tx, input.finishLevel, input);

      return tx.baseRate.create({
        data: {
          finishLevel: input.finishLevel,
          areaFromSqm: input.areaFromSqm,
          areaToSqm: input.areaToSqm,
          rateCentsPerSqm: input.rateCentsPerSqm,
          updatedById: adminId,
        },
        include: BASE_RATE_ADMIN_INCLUDE,
      });
    });

    this.pricingData.invalidate();

    return present(created);
  }

  async update(
    id: string,
    input: UpdateBaseRateInput,
    adminId: string,
  ): Promise<BaseRateAdmin> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);

      const existing = await tx.baseRate.findUnique({ where: { id } });

      if (!existing) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      if (existing.revision !== input.revision) {
        throw staleRevisionError(existing.revision);
      }

      const finishLevel = input.finishLevel ?? existing.finishLevel;
      const range = {
        areaFromSqm: input.areaFromSqm ?? existing.areaFromSqm.toNumber(),
        areaToSqm: input.areaToSqm ?? existing.areaToSqm.toNumber(),
      };
      const rateCentsPerSqm = input.rateCentsPerSqm ?? existing.rateCentsPerSqm;

      if (range.areaToSqm <= range.areaFromSqm) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          fields: [
            {
              path: 'areaToSqm',
              code: 'custom',
              params: {
                message: 'areaToSqm must be greater than areaFromSqm',
              },
            },
          ],
        });
      }

      await this.assertNoOverlap(tx, finishLevel, range, id);
      await updateWithRevision({
        id,
        expectedRevision: input.revision,
        updatedById: adminId,
        update: async ({ id: rateId, expectedRevision, mutation }) => {
          const result = await tx.baseRate.updateMany({
            where: { id: rateId, revision: expectedRevision },
            data: {
              finishLevel,
              areaFromSqm: range.areaFromSqm,
              areaToSqm: range.areaToSqm,
              rateCentsPerSqm,
              revision: mutation.revision,
              updatedAt: mutation.updatedAt,
              updatedById: mutation.updatedById,
            },
          });

          return result.count;
        },
        readCurrentRevision: async (rateId) => {
          const current = await tx.baseRate.findUnique({
            where: { id: rateId },
            select: { revision: true },
          });

          return current?.revision ?? null;
        },
      });

      return tx.baseRate.findUniqueOrThrow({
        where: { id },
        include: BASE_RATE_ADMIN_INCLUDE,
      });
    });

    this.pricingData.invalidate();

    return present(updated);
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.baseRate.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      throw error;
    }

    this.pricingData.invalidate();
  }

  private async lock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BASE_RATES_LOCK_KEY})`;
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    finishLevel: FinishLevel,
    range: Range,
    excludeId?: string,
  ): Promise<void> {
    const siblings = await tx.baseRate.findMany({
      where: {
        finishLevel,
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
      },
      orderBy: { areaFromSqm: 'asc' },
    });
    const conflict = siblings
      .map((row) => ({
        id: row.id,
        areaFromSqm: row.areaFromSqm.toNumber(),
        areaToSqm: row.areaToSqm.toNumber(),
      }))
      .find((candidate) => overlaps(candidate, range));

    if (conflict) {
      throw new AppError(ERROR_CODES.RANGE_OVERLAP, { params: { conflict } });
    }
  }
}
