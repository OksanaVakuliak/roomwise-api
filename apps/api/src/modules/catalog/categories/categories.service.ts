import { Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  PublicationStatus,
  type RoomTypeCode,
  type SurfaceKind,
} from '../../../generated/prisma/enums';
import type {
  CategoryAdmin,
  CategoryAdminListResponse,
} from './dto/category-admin.schema';
import type { UpdateCategoryStatusInput } from './dto/category-status.schema';
import type { CreateCategoryInput } from './dto/create-category.schema';
import type { ListCategoriesQuery } from './dto/list-categories.schema';
import type { PatchCategoryInput } from './dto/patch-category.schema';

const CATEGORY_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
  _count: { select: { products: true } },
  roomTypeCategories: {
    orderBy: { roomType: { sortOrder: 'asc' as const } },
    include: { roomType: { select: { code: true } } },
  },
};

interface CategoryWithRelations {
  id: string;
  name: unknown;
  wastePercent: { toNumber: () => number };
  surface: SurfaceKind;
  status: PublicationStatus;
  revision: string;
  updatedAt: Date;
  updatedBy: { id: string; login: string } | null;
  _count: { products: number };
  roomTypeCategories: Array<{ roomType: { code: RoomTypeCode } }>;
}

function toLocalizedText(value: unknown): LocalizedText {
  return value as LocalizedText;
}

function toCategoryAdmin(category: CategoryWithRelations): CategoryAdmin {
  return {
    id: category.id,
    name: toLocalizedText(category.name),
    wastePercent: category.wastePercent.toNumber(),
    surface: category.surface,
    status: category.status,
    productCount: category._count.products,
    roomTypeCodes: category.roomTypeCategories.map(
      (link) => link.roomType.code,
    ),
    revision: category.revision,
    updatedAt: category.updatedAt.toISOString(),
    updatedBy: category.updatedBy,
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategoriesQuery): Promise<CategoryAdminListResponse> {
    const categories = await this.prisma.category.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { updatedAt: 'asc' },
      include: CATEGORY_ADMIN_INCLUDE,
    });

    return { items: categories.map(toCategoryAdmin) };
  }

  async create(
    input: CreateCategoryInput,
    adminId: string,
  ): Promise<CategoryAdmin> {
    const category = await this.prisma.category.create({
      data: {
        name: input.name,
        wastePercent: input.wastePercent,
        surface: input.surface,
        status: PublicationStatus.DRAFT,
        updatedById: adminId,
      },
      include: CATEGORY_ADMIN_INCLUDE,
    });

    return toCategoryAdmin(category);
  }

  async update(
    id: string,
    input: PatchCategoryInput,
    adminId: string,
  ): Promise<CategoryAdmin> {
    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: categoryId, expectedRevision, mutation }) => {
        const result = await this.prisma.category.updateMany({
          where: { id: categoryId, revision: expectedRevision },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.wastePercent !== undefined
              ? { wastePercent: input.wastePercent }
              : {}),
            ...(input.surface !== undefined ? { surface: input.surface } : {}),
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (categoryId) => this.readRevision(categoryId),
    });

    return this.getById(id);
  }

  async updateStatus(
    id: string,
    input: UpdateCategoryStatusInput,
    adminId: string,
  ): Promise<CategoryAdmin> {
    if (input.status === PublicationStatus.PUBLISHED) {
      const category = await this.prisma.category.findUnique({
        where: { id },
        select: { name: true },
      });

      if (!category) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      assertTranslations({ name: toLocalizedText(category.name) });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: categoryId, expectedRevision, mutation }) => {
        const result = await this.prisma.category.updateMany({
          where: { id: categoryId, revision: expectedRevision },
          data: {
            status: input.status,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (categoryId) => this.readRevision(categoryId),
    });

    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
        roomTypeCategories: {
          include: { roomType: { select: { code: true } } },
        },
      },
    });

    if (!category) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const roomTypeCodes = category.roomTypeCategories.map(
      (link) => link.roomType.code,
    );

    if (category._count.products > 0 || roomTypeCodes.length > 0) {
      throw new AppError(ERROR_CODES.CATEGORY_IN_USE, {
        params: { productCount: category._count.products, roomTypeCodes },
      });
    }

    await this.prisma.category.delete({ where: { id } });
  }

  private async readRevision(id: string): Promise<string | null> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { revision: true },
    });

    return category?.revision ?? null;
  }

  private async getById(id: string): Promise<CategoryAdmin> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_ADMIN_INCLUDE,
    });

    if (!category) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return toCategoryAdmin(category);
  }
}
