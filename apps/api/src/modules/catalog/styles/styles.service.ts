import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { PublicationStatus } from '../../../generated/prisma/enums';
import { ImageUrlBuilder } from '../images/image-urls';
import type { CreateStyleInput } from './dto/create-style.schema';
import type { PatchStyleInput } from './dto/patch-style.schema';
import type {
  StyleAdmin,
  StyleAdminListItem,
  StyleAdminListResponse,
  StylePairAdmin,
} from './dto/style-admin.schema';
import type {
  StyleDefaultMaterialItemInput,
  StyleDefaultMaterialsInput,
} from './dto/style-default-materials.schema';
import type { StyleOrderInput } from './dto/style-order.schema';
import type { UpdateStyleStatusInput } from './dto/style-status.schema';

const STYLE_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
  image: { select: { id: true, publicId: true } },
} satisfies Prisma.StyleInclude;

type StyleWithRelations = Prisma.StyleGetPayload<{
  include: typeof STYLE_ADMIN_INCLUDE;
}>;

interface PairsSummary {
  pairs: StylePairAdmin[];
  unfilledCount: number;
  unavailableCount: number;
}

@Injectable()
export class StylesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ImageUrlBuilder) private readonly imageUrls: ImageUrlBuilder,
  ) {}

  async list(): Promise<StyleAdminListResponse> {
    const styles = await this.prisma.style.findMany({
      orderBy: { sortOrder: 'asc' },
      include: STYLE_ADMIN_INCLUDE,
    });

    const items = await Promise.all(
      styles.map((style) => this.toStyleAdminListItem(style)),
    );

    return { items };
  }

  async get(id: string): Promise<StyleAdmin> {
    return this.getById(id);
  }

  async create(input: CreateStyleInput, adminId: string): Promise<StyleAdmin> {
    if (input.imageId) {
      await this.assertImageExists(input.imageId);
    }

    const aggregate = await this.prisma.style.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (aggregate._max.sortOrder ?? -1) + 1;

    const created = await this.prisma.style.create({
      data: {
        name: input.name,
        description: input.description,
        imageId: input.imageId ?? null,
        sortOrder,
        status: PublicationStatus.DRAFT,
        updatedById: adminId,
      },
      include: STYLE_ADMIN_INCLUDE,
    });

    return this.getById(created.id);
  }

  async update(
    id: string,
    input: PatchStyleInput,
    adminId: string,
  ): Promise<StyleAdmin> {
    if (input.imageId !== undefined && input.imageId !== null) {
      await this.assertImageExists(input.imageId);
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: styleId, expectedRevision, mutation }) => {
        const result = await this.prisma.style.updateMany({
          where: { id: styleId, revision: expectedRevision },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (styleId) => this.readRevision(styleId),
    });

    return this.getById(id);
  }

  async reorder(input: StyleOrderInput, adminId: string): Promise<void> {
    const existing = await this.prisma.style.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((style) => style.id));
    const providedIds = new Set(input.styleIds);

    const isMismatched =
      providedIds.size !== input.styleIds.length ||
      providedIds.size !== existingIds.size ||
      input.styleIds.some((id) => !existingIds.has(id));

    if (isMismatched) {
      throw new AppError(ERROR_CODES.STYLE_SET_MISMATCH, {
        params: { styleIds: input.styleIds },
      });
    }

    const updatedAt = new Date();

    await this.prisma.$transaction(
      input.styleIds.map((id, index) =>
        this.prisma.style.update({
          where: { id },
          data: {
            sortOrder: index,
            revision: randomUUID(),
            updatedAt,
            updatedById: adminId,
          },
        }),
      ),
    );
  }

  async updateStatus(
    id: string,
    input: UpdateStyleStatusInput,
    adminId: string,
  ): Promise<StyleAdmin> {
    if (input.status === PublicationStatus.PUBLISHED) {
      const style = await this.prisma.style.findUnique({
        where: { id },
        select: { name: true, description: true, imageId: true },
      });

      if (!style) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      assertTranslations({
        name: toLocalizedText(style.name),
        description: toLocalizedText(style.description),
      });

      if (!style.imageId) {
        throw new AppError(ERROR_CODES.STYLE_IMAGE_MISSING);
      }
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: styleId, expectedRevision, mutation }) => {
        const result = await this.prisma.style.updateMany({
          where: { id: styleId, revision: expectedRevision },
          data: {
            status: input.status,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (styleId) => this.readRevision(styleId),
    });

    return this.getById(id);
  }

  async updateDefaultMaterials(
    id: string,
    input: StyleDefaultMaterialsInput,
    adminId: string,
  ): Promise<StyleAdmin> {
    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: ({ id: styleId, expectedRevision, mutation }) =>
        this.prisma.$transaction(async (tx) => {
          await this.assertItemsValid(tx, input.items);

          const result = await tx.style.updateMany({
            where: { id: styleId, revision: expectedRevision },
            data: {
              revision: mutation.revision,
              updatedAt: mutation.updatedAt,
              updatedById: mutation.updatedById,
            },
          });

          if (result.count === 0) {
            return 0;
          }

          for (const item of input.items) {
            if (item.productId === null) {
              await tx.styleDefaultMaterial.deleteMany({
                where: {
                  styleId,
                  roomTypeId: item.roomTypeId,
                  categoryId: item.categoryId,
                },
              });
              continue;
            }

            await tx.styleDefaultMaterial.upsert({
              where: {
                styleId_roomTypeId_categoryId: {
                  styleId,
                  roomTypeId: item.roomTypeId,
                  categoryId: item.categoryId,
                },
              },
              create: {
                styleId,
                roomTypeId: item.roomTypeId,
                categoryId: item.categoryId,
                productId: item.productId,
              },
              update: { productId: item.productId },
            });
          }

          return result.count;
        }),
      readCurrentRevision: (styleId) => this.readRevision(styleId),
    });

    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const style = await this.prisma.style.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!style) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    await this.prisma.style.delete({ where: { id } });
  }

  private async assertItemsValid(
    tx: Prisma.TransactionClient,
    items: StyleDefaultMaterialItemInput[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const links = await tx.roomTypeCategory.findMany({
      where: {
        OR: items.map((item) => ({
          roomTypeId: item.roomTypeId,
          categoryId: item.categoryId,
        })),
      },
      select: { roomTypeId: true, categoryId: true },
    });
    const validPairs = new Set(
      links.map((link) => `${link.roomTypeId}:${link.categoryId}`),
    );

    const invalidPairs = items.filter(
      (item) => !validPairs.has(`${item.roomTypeId}:${item.categoryId}`),
    );

    if (invalidPairs.length > 0) {
      throw new AppError(ERROR_CODES.PAIR_NOT_IN_ROOM_TYPE, {
        params: {
          pairs: invalidPairs.map((item) => ({
            roomTypeId: item.roomTypeId,
            categoryId: item.categoryId,
          })),
        },
      });
    }

    const productIds = [
      ...new Set(
        items
          .filter((item) => item.productId !== null)
          .map((item) => item.productId as string),
      ),
    ];

    if (productIds.length === 0) {
      return;
    }

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, categoryId: true },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    const mismatched = items.filter((item) => {
      if (item.productId === null) {
        return false;
      }

      const product = productById.get(item.productId);
      return !product || product.categoryId !== item.categoryId;
    });

    if (mismatched.length > 0) {
      throw new AppError(ERROR_CODES.PRODUCT_CATEGORY_MISMATCH, {
        params: {
          items: mismatched.map((item) => ({
            roomTypeId: item.roomTypeId,
            categoryId: item.categoryId,
            productId: item.productId,
          })),
        },
      });
    }
  }

  private async buildPairs(styleId: string): Promise<PairsSummary> {
    const [links, defaults] = await Promise.all([
      this.prisma.roomTypeCategory.findMany({
        orderBy: [{ roomType: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
        include: {
          roomType: { select: { code: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.styleDefaultMaterial.findMany({
        where: { styleId },
        include: {
          product: { select: { id: true, name: true, status: true } },
        },
      }),
    ]);

    const defaultsByPair = new Map(
      defaults.map((entry) => [
        `${entry.roomTypeId}:${entry.categoryId}`,
        entry,
      ]),
    );

    let unfilledCount = 0;
    let unavailableCount = 0;

    const pairs: StylePairAdmin[] = links.map((link) => {
      const entry = defaultsByPair.get(`${link.roomTypeId}:${link.categoryId}`);

      if (!entry) {
        unfilledCount += 1;
        return {
          roomTypeCode: link.roomType.code,
          roomTypeId: link.roomTypeId,
          categoryId: link.categoryId,
          categoryName: toLocalizedText(link.category.name),
          productId: null,
          productName: null,
          state: 'EMPTY',
        };
      }

      const isAvailable = entry.product.status === PublicationStatus.PUBLISHED;

      if (!isAvailable) {
        unavailableCount += 1;
      }

      return {
        roomTypeCode: link.roomType.code,
        roomTypeId: link.roomTypeId,
        categoryId: link.categoryId,
        categoryName: toLocalizedText(link.category.name),
        productId: entry.product.id,
        productName: toLocalizedText(entry.product.name),
        state: isAvailable ? 'FILLED' : 'PRODUCT_UNAVAILABLE',
      };
    });

    return { pairs, unfilledCount, unavailableCount };
  }

  private async assertImageExists(imageId: string): Promise<void> {
    const image = await this.prisma.image.findUnique({
      where: { id: imageId },
      select: { id: true },
    });

    if (!image) {
      throw new AppError(ERROR_CODES.IMAGE_NOT_FOUND, {
        params: { imageIds: [imageId] },
      });
    }
  }

  private async readRevision(id: string): Promise<string | null> {
    const style = await this.prisma.style.findUnique({
      where: { id },
      select: { revision: true },
    });

    return style?.revision ?? null;
  }

  private async getById(id: string): Promise<StyleAdmin> {
    const style = await this.prisma.style.findUnique({
      where: { id },
      include: STYLE_ADMIN_INCLUDE,
    });

    if (!style) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const { pairs, unfilledCount, unavailableCount } =
      await this.buildPairs(id);

    return this.toStyleAdmin(style, pairs, unfilledCount, unavailableCount);
  }

  private async toStyleAdminListItem(
    style: StyleWithRelations,
  ): Promise<StyleAdminListItem> {
    const { unfilledCount, unavailableCount } = await this.buildPairs(style.id);

    return {
      id: style.id,
      name: toLocalizedText(style.name),
      description: toLocalizedText(style.description),
      image: style.image ? this.imageUrls.toImageRef(style.image) : null,
      status: style.status,
      sortOrder: style.sortOrder,
      revision: style.revision,
      updatedAt: style.updatedAt.toISOString(),
      updatedBy: style.updatedBy,
      unfilledPairs: unfilledCount,
      unavailablePairs: unavailableCount,
    };
  }

  private toStyleAdmin(
    style: StyleWithRelations,
    pairs: StylePairAdmin[],
    unfilledCount: number,
    unavailableCount: number,
  ): StyleAdmin {
    return {
      id: style.id,
      name: toLocalizedText(style.name),
      description: toLocalizedText(style.description),
      image: style.image ? this.imageUrls.toImageRef(style.image) : null,
      status: style.status,
      sortOrder: style.sortOrder,
      revision: style.revision,
      updatedAt: style.updatedAt.toISOString(),
      updatedBy: style.updatedBy,
      pairs,
      unfilledCount,
      unavailableCount,
    };
  }
}
