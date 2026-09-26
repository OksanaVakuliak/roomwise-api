import { Inject, Injectable } from '@nestjs/common';
import {
  staleRevisionError,
  updateWithRevision,
} from '../../../common/concurrency/revision';
import { AppError, type ErrorField } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import { Prisma } from '../../../generated/prisma/client';
import type { OptionUnit } from '../../../generated/prisma/enums';
import { PublicationStatus } from '../../../generated/prisma/enums';
import type { CreateEngineeringPackageItemInput } from './dto/create-engineering-package-item.schema';
import type {
  EngineeringPackageItemAdmin,
  EngineeringPackageItemAdminListResponse,
} from './dto/engineering-package-item-admin.schema';
import type { EngineeringPackageItemOrderInput } from './dto/engineering-package-item-order.schema';
import type { UpdateEngineeringPackageItemStatusInput } from './dto/engineering-package-item-status.schema';
import type { PatchEngineeringPackageItemInput } from './dto/patch-engineering-package-item.schema';

const PRICE_NOT_ALLOWED_FIELD_CODE = 'PRICE_NOT_ALLOWED';
const UNIT_NOT_ALLOWED_FIELD_CODE = 'UNIT_NOT_ALLOWED';

const ENGINEERING_PACKAGE_ITEM_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
} satisfies Prisma.EngineeringPackageItemInclude;

type EngineeringPackageItemRow = Prisma.EngineeringPackageItemGetPayload<{
  include: typeof ENGINEERING_PACKAGE_ITEM_ADMIN_INCLUDE;
}>;

interface MergedPriceState {
  includedInBase: boolean;
  priceCents: number | null;
  unit: OptionUnit | null;
}

interface ExistingForPatch {
  revision: string;
  status: PublicationStatus;
  name: LocalizedText;
  description: LocalizedText;
  includedInBase: boolean;
  priceCents: number | null;
  unit: OptionUnit | null;
}

@Injectable()
export class EngineeringPackageItemsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<EngineeringPackageItemAdminListResponse> {
    const items = await this.prisma.engineeringPackageItem.findMany({
      orderBy: { sortOrder: 'asc' },
      include: ENGINEERING_PACKAGE_ITEM_ADMIN_INCLUDE,
    });

    return { items: items.map((item) => this.toAdmin(item)) };
  }

  async create(
    input: CreateEngineeringPackageItemInput,
    adminId: string,
  ): Promise<EngineeringPackageItemAdmin> {
    const normalized = this.normalizePrice({
      includedInBase: input.includedInBase,
      priceCents: input.priceCents ?? null,
      unit: input.unit ?? null,
    });

    const aggregate = await this.prisma.engineeringPackageItem.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (aggregate._max.sortOrder ?? -1) + 1;

    const created = await this.prisma.engineeringPackageItem.create({
      data: {
        name: input.name,
        description: input.description,
        includedInBase: normalized.includedInBase,
        priceCents: normalized.priceCents,
        unit: normalized.unit,
        sortOrder,
        status: PublicationStatus.DRAFT,
        updatedById: adminId,
      },
      include: ENGINEERING_PACKAGE_ITEM_ADMIN_INCLUDE,
    });

    return this.toAdmin(created);
  }

  async update(
    id: string,
    input: PatchEngineeringPackageItemInput,
    adminId: string,
  ): Promise<EngineeringPackageItemAdmin> {
    const existing = await this.loadExistingForPatch(id);

    if (existing.revision !== input.revision) {
      throw staleRevisionError(existing.revision);
    }

    const mergedIncludedInBase =
      input.includedInBase ?? existing.includedInBase;
    const mergedPriceCents =
      input.priceCents !== undefined ? input.priceCents : existing.priceCents;
    const mergedUnit = input.unit !== undefined ? input.unit : existing.unit;

    this.assertNoPriceOrUnitWhenIncluded(mergedIncludedInBase, input);

    const normalized = this.normalizePrice({
      includedInBase: mergedIncludedInBase,
      priceCents: mergedPriceCents,
      unit: mergedUnit,
    });

    if (existing.status === PublicationStatus.PUBLISHED) {
      assertTranslations({
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
      });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: itemId, expectedRevision, mutation }) => {
        const result = await this.prisma.engineeringPackageItem.updateMany({
          where: { id: itemId, revision: expectedRevision },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            includedInBase: normalized.includedInBase,
            priceCents: normalized.priceCents,
            unit: normalized.unit,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (itemId) => this.readRevision(itemId),
    });

    return this.getById(id);
  }

  async updateStatus(
    id: string,
    input: UpdateEngineeringPackageItemStatusInput,
    adminId: string,
  ): Promise<EngineeringPackageItemAdmin> {
    if (input.status === PublicationStatus.PUBLISHED) {
      const item = await this.prisma.engineeringPackageItem.findUnique({
        where: { id },
        select: { name: true, description: true },
      });

      if (!item) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      assertTranslations({
        name: toLocalizedText(item.name),
        description: toLocalizedText(item.description),
      });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: itemId, expectedRevision, mutation }) => {
        const result = await this.prisma.engineeringPackageItem.updateMany({
          where: { id: itemId, revision: expectedRevision },
          data: {
            status: input.status,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (itemId) => this.readRevision(itemId),
    });

    return this.getById(id);
  }

  async reorder(
    input: EngineeringPackageItemOrderInput,
    adminId: string,
  ): Promise<void> {
    const existing = await this.prisma.engineeringPackageItem.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
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
          this.prisma.engineeringPackageItem.update({
            where: { id },
            data: {
              sortOrder: index,
              updatedAt,
              updatedById: adminId,
            },
          }),
        ),
      );
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          params: { ids: input.ids },
        });
      }

      if (isPrismaError(error, 'P2034')) {
        throw new AppError(ERROR_CODES.CONFLICT);
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.prisma.engineeringPackageItem.deleteMany({
      where: { id },
    });

    if (result.count === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }
  }

  private assertNoPriceOrUnitWhenIncluded(
    mergedIncludedInBase: boolean,
    input: PatchEngineeringPackageItemInput,
  ): void {
    if (!mergedIncludedInBase) {
      return;
    }

    const fields: ErrorField[] = [];

    if (typeof input.priceCents === 'number') {
      fields.push({ path: 'priceCents', code: PRICE_NOT_ALLOWED_FIELD_CODE });
    }

    if (typeof input.unit === 'string') {
      fields.push({ path: 'unit', code: UNIT_NOT_ALLOWED_FIELD_CODE });
    }

    if (fields.length > 0) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, { fields });
    }
  }

  private normalizePrice(state: MergedPriceState): MergedPriceState {
    if (state.includedInBase) {
      return { includedInBase: true, priceCents: null, unit: null };
    }

    const missing: string[] = [];

    if (state.priceCents === null || state.priceCents <= 0) {
      missing.push('priceCents');
    }

    if (state.unit === null) {
      missing.push('unit');
    }

    if (missing.length > 0) {
      throw new AppError(ERROR_CODES.PRICE_REQUIRED, { params: { missing } });
    }

    return state;
  }

  private async readRevision(id: string): Promise<string | null> {
    const item = await this.prisma.engineeringPackageItem.findUnique({
      where: { id },
      select: { revision: true },
    });

    return item?.revision ?? null;
  }

  private async loadExistingForPatch(id: string): Promise<ExistingForPatch> {
    const item = await this.prisma.engineeringPackageItem.findUnique({
      where: { id },
      select: {
        revision: true,
        status: true,
        name: true,
        description: true,
        includedInBase: true,
        priceCents: true,
        unit: true,
      },
    });

    if (!item) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return {
      revision: item.revision,
      status: item.status,
      name: toLocalizedText(item.name),
      description: toLocalizedText(item.description),
      includedInBase: item.includedInBase,
      priceCents: item.priceCents,
      unit: item.unit,
    };
  }

  private async getById(id: string): Promise<EngineeringPackageItemAdmin> {
    const item = await this.prisma.engineeringPackageItem.findUnique({
      where: { id },
      include: ENGINEERING_PACKAGE_ITEM_ADMIN_INCLUDE,
    });

    if (!item) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return this.toAdmin(item);
  }

  private toAdmin(
    item: EngineeringPackageItemRow,
  ): EngineeringPackageItemAdmin {
    return {
      id: item.id,
      name: toLocalizedText(item.name),
      description: toLocalizedText(item.description),
      includedInBase: item.includedInBase,
      priceCents: item.priceCents,
      unit: item.unit,
      status: item.status,
      sortOrder: item.sortOrder,
      revision: item.revision,
      updatedAt: item.updatedAt.toISOString(),
      updatedBy: item.updatedBy,
    };
  }
}
