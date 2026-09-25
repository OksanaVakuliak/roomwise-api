import { Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  PublicationStatus,
  SurfaceKind,
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
} satisfies Prisma.CategoryInclude;

type CategoryWithRelations = Prisma.CategoryGetPayload<{
  include: typeof CATEGORY_ADMIN_INCLUDE;
}>;

function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
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
      include: CATEGORY_ADMIN_INCLUDE,
    });

    const items = categories
      .map(toCategoryAdmin)
      .sort(
        (a, b) =>
          a.name.uk.localeCompare(b.name.uk, 'uk') || a.id.localeCompare(b.id),
      );

    return { items };
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
    if (input.surface !== undefined && input.surface !== SurfaceKind.NONE) {
      const existing = await this.prisma.category.findUnique({
        where: { id },
        select: { surface: true },
      });

      if (!existing) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      if (input.surface !== existing.surface) {
        await this.assertPublishedProductsHaveSurfaceData(id);
      }
    }

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
    try {
      await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.findUnique({
          where: { id },
          include: {
            _count: { select: { products: true } },
            roomTypeCategories: {
              include: { roomType: { select: { code: true } } },
            },
            styleDefaultMaterials: {
              include: { style: { select: { id: true, name: true } } },
            },
          },
        });

        if (!category) {
          throw new AppError(ERROR_CODES.NOT_FOUND);
        }

        const roomTypeCodes = category.roomTypeCategories.map(
          (link) => link.roomType.code,
        );
        const styles = this.uniqueStyles(category.styleDefaultMaterials);

        if (
          category._count.products > 0 ||
          roomTypeCodes.length > 0 ||
          styles.length > 0
        ) {
          throw new AppError(ERROR_CODES.CATEGORY_IN_USE, {
            params: {
              productCount: category._count.products,
              roomTypeCodes,
              styles,
            },
          });
        }

        await tx.category.delete({ where: { id } });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AppError(ERROR_CODES.CATEGORY_IN_USE);
      }

      throw error;
    }
  }

  private uniqueStyles(
    links: Array<{ style: { id: string; name: unknown } }>,
  ): Array<{ id: string; name: LocalizedText }> {
    const stylesById = new Map<string, { id: string; name: LocalizedText }>();

    for (const link of links) {
      stylesById.set(link.style.id, {
        id: link.style.id,
        name: toLocalizedText(link.style.name),
      });
    }

    return [...stylesById.values()];
  }

  private async assertPublishedProductsHaveSurfaceData(
    categoryId: string,
  ): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { categoryId, status: PublicationStatus.PUBLISHED },
      select: {
        id: true,
        textureImageId: true,
        tileWidthMm: true,
        tileLengthMm: true,
        fallbackColor: true,
      },
    });

    const productIds = products
      .filter(
        (product) =>
          !product.textureImageId ||
          !product.tileWidthMm ||
          !product.tileLengthMm ||
          !product.fallbackColor,
      )
      .map((product) => product.id);

    if (productIds.length > 0) {
      throw new AppError(ERROR_CODES.SURFACE_DATA_MISSING, {
        params: { productIds },
      });
    }
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
