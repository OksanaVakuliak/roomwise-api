import { Inject, Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  PublicationStatus,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { type ImageSource, ImageUrlBuilder } from '../images/image-urls';
import type {
  CreateProductInput,
  ProductAttributeInput,
  ProductImageInput,
} from './dto/create-product.schema';
import type { ListProductsQuery } from './dto/list-products.schema';
import type { PatchProductInput } from './dto/patch-product.schema';
import type {
  ProductAdmin,
  ProductImageAdmin,
} from './dto/product-admin.schema';
import type {
  ProductAdminListItem,
  ProductAdminListResponse,
} from './dto/product-admin-list-item.schema';
import type {
  ProductStatusResponse,
  ProductStatusWarning,
  UpdateProductStatusInput,
} from './dto/product-status.schema';

const PRODUCT_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
  category: { select: { surface: true } },
  images: {
    orderBy: { sortOrder: 'asc' as const },
    include: { image: { select: { id: true, publicId: true } } },
  },
  attributes: {
    orderBy: { sortOrder: 'asc' as const },
  },
  textureImage: { select: { id: true, publicId: true } },
};

const PRODUCT_LIST_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
  images: {
    where: { isPrimary: true },
    take: 1,
    include: { image: { select: { id: true, publicId: true } } },
  },
};

interface ProductAdminRow {
  id: string;
  categoryId: string;
  materialTypeId: string;
  name: unknown;
  description: unknown;
  brand: string;
  manufacturer: string;
  color: unknown;
  size: unknown;
  priceCents: number;
  unit: string;
  wastePercentOverride: { toNumber: () => number } | null;
  heatedFloorCompatible: boolean;
  tileWidthMm: number | null;
  tileLengthMm: number | null;
  fallbackColor: string | null;
  status: PublicationStatus;
  revision: string;
  updatedAt: Date;
  updatedBy: { id: string; login: string } | null;
  images: Array<{ isPrimary: boolean; image: ImageSource }>;
  attributes: Array<{ name: unknown; value: unknown }>;
  textureImage: ImageSource | null;
}

interface ProductListRow {
  id: string;
  name: unknown;
  categoryId: string;
  status: PublicationStatus;
  priceCents: number;
  unit: string;
  updatedAt: Date;
  updatedBy: { id: string; login: string } | null;
  images: Array<{ image: ImageSource }>;
}

interface PublishableCandidate {
  name: LocalizedText;
  description: LocalizedText;
  color: LocalizedText;
  size: LocalizedText;
  attributes: Array<{ name: LocalizedText; value: LocalizedText }>;
  surface: string;
  textureImageId: string | null;
  tileWidthMm: number | null;
  tileLengthMm: number | null;
  fallbackColor: string | null;
  hasPrimaryImage: boolean;
}

interface ExistingProductForPatch {
  categoryId: string;
  materialTypeId: string;
  status: PublicationStatus;
  name: LocalizedText;
  description: LocalizedText;
  color: LocalizedText;
  size: LocalizedText;
  priceCents: number;
  textureImageId: string | null;
  tileWidthMm: number | null;
  tileLengthMm: number | null;
  fallbackColor: string | null;
  category: { surface: string };
  images: Array<{ isPrimary: boolean }>;
  attributes: Array<{ name: LocalizedText; value: LocalizedText }>;
}

function toLocalizedText(value: unknown): LocalizedText {
  return value as LocalizedText;
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ImageUrlBuilder) private readonly imageUrls: ImageUrlBuilder,
  ) {}

  async list(query: ListProductsQuery): Promise<ProductAdminListResponse> {
    const where = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' as const }, { id: 'asc' as const }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: PRODUCT_LIST_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toProductAdminListItem(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<ProductAdmin> {
    return this.getById(id);
  }

  async create(
    input: CreateProductInput,
    adminId: string,
  ): Promise<ProductAdmin> {
    await this.assertCategoryExists(input.categoryId);
    await this.assertMaterialTypeExists(input.materialTypeId);
    await this.assertImagesExist(
      input.images.map((image) => image.imageId),
      'images',
    );
    if (input.textureImageId) {
      await this.assertImagesExist([input.textureImageId], 'textureImageId');
    }
    this.assertZeroPriceConfirmed(input.priceCents, input.confirmZeroPrice);

    const created = await this.prisma.product.create({
      data: {
        categoryId: input.categoryId,
        materialTypeId: input.materialTypeId,
        name: input.name,
        description: input.description,
        brand: input.brand,
        manufacturer: input.manufacturer,
        color: input.color,
        size: input.size,
        priceCents: input.priceCents,
        unit: input.unit,
        wastePercentOverride: input.wastePercentOverride,
        heatedFloorCompatible: input.heatedFloorCompatible,
        textureImageId: input.textureImageId,
        tileWidthMm: input.tileWidthMm,
        tileLengthMm: input.tileLengthMm,
        fallbackColor: input.fallbackColor,
        status: PublicationStatus.DRAFT,
        updatedById: adminId,
        images: {
          create: input.images.map((image, index) =>
            this.toProductImageCreateInput(image, index),
          ),
        },
        attributes: {
          create: input.attributes.map((attribute, index) =>
            this.toProductAttributeCreateInput(attribute, index),
          ),
        },
      },
      include: PRODUCT_ADMIN_INCLUDE,
    });

    return this.toProductAdmin(created);
  }

  async update(
    id: string,
    input: PatchProductInput,
    adminId: string,
  ): Promise<ProductAdmin> {
    const existing = await this.loadExistingForPatch(id);

    if (
      input.categoryId !== undefined &&
      input.categoryId !== existing.categoryId
    ) {
      await this.assertCategoryExists(input.categoryId);
    }
    if (input.materialTypeId !== undefined) {
      await this.assertMaterialTypeExists(input.materialTypeId);
    }
    if (input.images !== undefined) {
      await this.assertImagesExist(
        input.images.map((image) => image.imageId),
        'images',
      );
    }
    if (input.textureImageId !== undefined && input.textureImageId !== null) {
      await this.assertImagesExist([input.textureImageId], 'textureImageId');
    }

    const resolvedPriceCents = input.priceCents ?? existing.priceCents;
    if (input.priceCents !== undefined) {
      this.assertZeroPriceConfirmed(resolvedPriceCents, input.confirmZeroPrice);
    }

    if (existing.status === PublicationStatus.PUBLISHED) {
      const resolvedSurface =
        input.categoryId !== undefined &&
        input.categoryId !== existing.categoryId
          ? await this.readCategorySurface(input.categoryId)
          : existing.category.surface;

      this.assertPublishable({
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        color: input.color ?? existing.color,
        size: input.size ?? existing.size,
        attributes: input.attributes ?? existing.attributes,
        surface: resolvedSurface,
        textureImageId:
          input.textureImageId !== undefined
            ? input.textureImageId
            : existing.textureImageId,
        tileWidthMm:
          input.tileWidthMm !== undefined
            ? input.tileWidthMm
            : existing.tileWidthMm,
        tileLengthMm:
          input.tileLengthMm !== undefined
            ? input.tileLengthMm
            : existing.tileLengthMm,
        fallbackColor:
          input.fallbackColor !== undefined
            ? input.fallbackColor
            : existing.fallbackColor,
        hasPrimaryImage:
          input.images !== undefined
            ? input.images.some((image) => image.isPrimary)
            : existing.images.some((image) => image.isPrimary),
      });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: ({ id: productId, expectedRevision, mutation }) =>
        this.prisma.$transaction(async (tx) => {
          const result = await tx.product.updateMany({
            where: { id: productId, revision: expectedRevision },
            data: {
              ...(input.categoryId !== undefined
                ? { categoryId: input.categoryId }
                : {}),
              ...(input.materialTypeId !== undefined
                ? { materialTypeId: input.materialTypeId }
                : {}),
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
              ...(input.brand !== undefined ? { brand: input.brand } : {}),
              ...(input.manufacturer !== undefined
                ? { manufacturer: input.manufacturer }
                : {}),
              ...(input.color !== undefined ? { color: input.color } : {}),
              ...(input.size !== undefined ? { size: input.size } : {}),
              ...(input.priceCents !== undefined
                ? { priceCents: input.priceCents }
                : {}),
              ...(input.unit !== undefined ? { unit: input.unit } : {}),
              ...(input.wastePercentOverride !== undefined
                ? { wastePercentOverride: input.wastePercentOverride }
                : {}),
              ...(input.heatedFloorCompatible !== undefined
                ? { heatedFloorCompatible: input.heatedFloorCompatible }
                : {}),
              ...(input.textureImageId !== undefined
                ? { textureImageId: input.textureImageId }
                : {}),
              ...(input.tileWidthMm !== undefined
                ? { tileWidthMm: input.tileWidthMm }
                : {}),
              ...(input.tileLengthMm !== undefined
                ? { tileLengthMm: input.tileLengthMm }
                : {}),
              ...(input.fallbackColor !== undefined
                ? { fallbackColor: input.fallbackColor }
                : {}),
              revision: mutation.revision,
              updatedAt: mutation.updatedAt,
              updatedById: mutation.updatedById,
            },
          });

          if (result.count === 0) {
            return 0;
          }

          if (input.images !== undefined) {
            await tx.productImage.deleteMany({ where: { productId } });

            if (input.images.length > 0) {
              await tx.productImage.createMany({
                data: input.images.map((image, index) => ({
                  productId,
                  ...this.toProductImageCreateInput(image, index),
                })),
              });
            }
          }

          if (input.attributes !== undefined) {
            await tx.productAttribute.deleteMany({ where: { productId } });

            if (input.attributes.length > 0) {
              await tx.productAttribute.createMany({
                data: input.attributes.map((attribute, index) => ({
                  productId,
                  ...this.toProductAttributeCreateInput(attribute, index),
                })),
              });
            }
          }

          return result.count;
        }),
      readCurrentRevision: (productId) => this.readRevision(productId),
    });

    return this.getById(id);
  }

  async changeStatus(
    id: string,
    input: UpdateProductStatusInput,
    adminId: string,
  ): Promise<ProductStatusResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        name: true,
        description: true,
        color: true,
        size: true,
        textureImageId: true,
        tileWidthMm: true,
        tileLengthMm: true,
        fallbackColor: true,
        category: { select: { surface: true } },
        images: { select: { isPrimary: true } },
        attributes: { select: { name: true, value: true } },
      },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    if (input.status === PublicationStatus.PUBLISHED) {
      this.assertPublishable({
        name: toLocalizedText(product.name),
        description: toLocalizedText(product.description),
        color: toLocalizedText(product.color),
        size: toLocalizedText(product.size),
        attributes: product.attributes.map((attribute) => ({
          name: toLocalizedText(attribute.name),
          value: toLocalizedText(attribute.value),
        })),
        surface: product.category.surface,
        textureImageId: product.textureImageId,
        tileWidthMm: product.tileWidthMm,
        tileLengthMm: product.tileLengthMm,
        fallbackColor: product.fallbackColor,
        hasPrimaryImage: product.images.some((image) => image.isPrimary),
      });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: productId, expectedRevision, mutation }) => {
        const result = await this.prisma.product.updateMany({
          where: { id: productId, revision: expectedRevision },
          data: {
            status: input.status,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (productId) => this.readRevision(productId),
    });

    const updated = await this.getById(id);

    if (input.status === PublicationStatus.ARCHIVED) {
      const warnings = await this.buildArchiveWarnings(id);
      if (warnings.length > 0) {
        return { ...updated, warnings };
      }
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        styleDefaultMaterials: {
          include: { style: { select: { id: true, name: true } } },
        },
      },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    if (product.styleDefaultMaterials.length > 0) {
      throw new AppError(ERROR_CODES.PRODUCT_IN_USE, {
        params: { styles: this.uniqueStyles(product.styleDefaultMaterials) },
      });
    }

    await this.prisma.product.delete({ where: { id } });
  }

  private async buildArchiveWarnings(
    productId: string,
  ): Promise<ProductStatusWarning[]> {
    const links = await this.prisma.styleDefaultMaterial.findMany({
      where: { productId },
      include: { style: { select: { id: true, name: true } } },
    });

    if (links.length === 0) {
      return [];
    }

    return [
      {
        code: 'USED_AS_DEFAULT_MATERIAL',
        params: { styles: this.uniqueStyles(links) },
      },
    ];
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

  private assertPublishable(candidate: PublishableCandidate): void {
    const fields: Record<string, LocalizedText> = {
      name: candidate.name,
      description: candidate.description,
      color: candidate.color,
      size: candidate.size,
    };

    candidate.attributes.forEach((attribute, index) => {
      fields[`attributes.${index}.name`] = attribute.name;
      fields[`attributes.${index}.value`] = attribute.value;
    });

    assertTranslations(fields);

    if (candidate.surface !== SurfaceKind.NONE) {
      const missing: string[] = [];

      if (!candidate.textureImageId) {
        missing.push('texture');
      }
      if (!candidate.tileWidthMm || !candidate.tileLengthMm) {
        missing.push('tileSize');
      }
      if (!candidate.fallbackColor) {
        missing.push('fallbackColor');
      }

      if (missing.length > 0) {
        throw new AppError(ERROR_CODES.SURFACE_DATA_MISSING, {
          params: { missing },
        });
      }
    }

    if (!candidate.hasPrimaryImage) {
      throw new AppError(ERROR_CODES.PRIMARY_IMAGE_MISSING);
    }
  }

  private assertZeroPriceConfirmed(
    priceCents: number,
    confirmZeroPrice: boolean | undefined,
  ): void {
    if (priceCents === 0 && confirmZeroPrice !== true) {
      throw new AppError(ERROR_CODES.ZERO_PRICE_NOT_CONFIRMED);
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND);
    }
  }

  private async readCategorySurface(categoryId: string): Promise<string> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { surface: true },
    });

    if (!category) {
      throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND);
    }

    return category.surface;
  }

  private async assertMaterialTypeExists(
    materialTypeId: string,
  ): Promise<void> {
    const materialType = await this.prisma.materialType.findUnique({
      where: { id: materialTypeId },
      select: { id: true },
    });

    if (!materialType) {
      throw new AppError(ERROR_CODES.UNPROCESSABLE, {
        params: { field: 'materialTypeId' },
      });
    }
  }

  private async assertImagesExist(
    imageIds: string[],
    field: string,
  ): Promise<void> {
    if (imageIds.length === 0) {
      return;
    }

    const uniqueIds = [...new Set(imageIds)];
    const found = await this.prisma.image.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((image) => image.id));
    const missing = uniqueIds.filter((imageId) => !foundIds.has(imageId));

    if (missing.length > 0) {
      throw new AppError(ERROR_CODES.UNPROCESSABLE, {
        params: { field, ids: missing },
      });
    }
  }

  private toProductImageCreateInput(
    image: ProductImageInput,
    index: number,
  ): { imageId: string; isPrimary: boolean; sortOrder: number } {
    return {
      imageId: image.imageId,
      isPrimary: image.isPrimary,
      sortOrder: index,
    };
  }

  private toProductAttributeCreateInput(
    attribute: ProductAttributeInput,
    index: number,
  ): { name: LocalizedText; value: LocalizedText; sortOrder: number } {
    return {
      name: attribute.name,
      value: attribute.value,
      sortOrder: index,
    };
  }

  private async readRevision(id: string): Promise<string | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { revision: true },
    });

    return product?.revision ?? null;
  }

  private async loadExistingForPatch(
    id: string,
  ): Promise<ExistingProductForPatch> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        categoryId: true,
        materialTypeId: true,
        status: true,
        name: true,
        description: true,
        color: true,
        size: true,
        priceCents: true,
        textureImageId: true,
        tileWidthMm: true,
        tileLengthMm: true,
        fallbackColor: true,
        category: { select: { surface: true } },
        images: { select: { isPrimary: true } },
        attributes: { select: { name: true, value: true } },
      },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return {
      categoryId: product.categoryId,
      materialTypeId: product.materialTypeId,
      status: product.status,
      name: toLocalizedText(product.name),
      description: toLocalizedText(product.description),
      color: toLocalizedText(product.color),
      size: toLocalizedText(product.size),
      priceCents: product.priceCents,
      textureImageId: product.textureImageId,
      tileWidthMm: product.tileWidthMm,
      tileLengthMm: product.tileLengthMm,
      fallbackColor: product.fallbackColor,
      category: product.category,
      images: product.images,
      attributes: product.attributes.map((attribute) => ({
        name: toLocalizedText(attribute.name),
        value: toLocalizedText(attribute.value),
      })),
    };
  }

  private async getById(id: string): Promise<ProductAdmin> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_ADMIN_INCLUDE,
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return this.toProductAdmin(product);
  }

  private toProductAdmin(product: ProductAdminRow): ProductAdmin {
    const images: ProductImageAdmin[] = product.images.map((productImage) => ({
      ...this.imageUrls.toImageRef(productImage.image),
      isPrimary: productImage.isPrimary,
    }));

    return {
      id: product.id,
      categoryId: product.categoryId,
      materialTypeId: product.materialTypeId,
      name: toLocalizedText(product.name),
      description: toLocalizedText(product.description),
      brand: product.brand,
      manufacturer: product.manufacturer,
      color: toLocalizedText(product.color),
      size: toLocalizedText(product.size),
      priceCents: product.priceCents,
      unit: product.unit as ProductAdmin['unit'],
      wastePercentOverride: product.wastePercentOverride?.toNumber() ?? null,
      heatedFloorCompatible: product.heatedFloorCompatible,
      images,
      attributes: product.attributes.map((attribute) => ({
        name: toLocalizedText(attribute.name),
        value: toLocalizedText(attribute.value),
      })),
      tileWidthMm: product.tileWidthMm,
      tileLengthMm: product.tileLengthMm,
      fallbackColor: product.fallbackColor,
      texture: product.textureImage
        ? this.imageUrls.toTextureRef(product.textureImage)
        : null,
      status: product.status,
      revision: product.revision,
      updatedAt: product.updatedAt.toISOString(),
      updatedBy: product.updatedBy,
    };
  }

  private toProductAdminListItem(
    product: ProductListRow,
  ): ProductAdminListItem {
    const primaryImage = product.images[0];

    return {
      id: product.id,
      name: toLocalizedText(product.name),
      categoryId: product.categoryId,
      status: product.status,
      priceCents: product.priceCents,
      unit: product.unit as ProductAdminListItem['unit'],
      image: primaryImage
        ? this.imageUrls.toImageRef(primaryImage.image)
        : null,
      updatedAt: product.updatedAt.toISOString(),
      updatedBy: product.updatedBy,
    };
  }
}
