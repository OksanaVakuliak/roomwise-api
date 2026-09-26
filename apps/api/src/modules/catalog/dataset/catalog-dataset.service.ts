import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { CLOUDINARY_UPLOAD_FOLDER } from '../images/images.constants';
import type { CatalogDataset } from './catalog-dataset.schema';

const UUID_VERSION_5 = 0x50;
const UUID_VERSION_MASK = 0x0f;
const UUID_VARIANT_RFC4122 = 0x80;
const UUID_VARIANT_MASK = 0x3f;
const UUID_VERSION_BYTE = 6;
const UUID_VARIANT_BYTE = 8;
const UUID_BYTE_LENGTH = 16;
const UUID_HEX_GROUPS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;
const PRODUCT_ATTRIBUTE_NAMESPACE = 'roomwise:catalog:product-attribute';

type WithId<Row> = Row & { id: string };

export interface CatalogDatasetRows {
  images: WithId<Prisma.ImageCreateManyInput>[];
  roomTypes: WithId<Prisma.RoomTypeCreateManyInput>[];
  materialTypes: WithId<Prisma.MaterialTypeCreateManyInput>[];
  categories: WithId<Prisma.CategoryCreateManyInput>[];
  roomTypeCategories: Prisma.RoomTypeCategoryCreateManyInput[];
  products: WithId<Prisma.ProductCreateManyInput>[];
  productImages: Prisma.ProductImageCreateManyInput[];
  productAttributes: WithId<Prisma.ProductAttributeCreateManyInput>[];
  styles: WithId<Prisma.StyleCreateManyInput>[];
  styleDefaultMaterials: Prisma.StyleDefaultMaterialCreateManyInput[];
  engineeringItems: WithId<Prisma.EngineeringPackageItemCreateManyInput>[];
  options: WithId<Prisma.OptionCreateManyInput>[];
  optionRoomTypes: Prisma.OptionRoomTypeCreateManyInput[];
}

export function deriveProductAttributeId(
  productId: string,
  index: number,
): string {
  const bytes = createHash('sha1')
    .update(`${PRODUCT_ATTRIBUTE_NAMESPACE}:${productId}:${index}`)
    .digest()
    .subarray(0, UUID_BYTE_LENGTH);

  bytes[UUID_VERSION_BYTE] =
    (bytes[UUID_VERSION_BYTE] & UUID_VERSION_MASK) | UUID_VERSION_5;
  bytes[UUID_VARIANT_BYTE] =
    (bytes[UUID_VARIANT_BYTE] & UUID_VARIANT_MASK) | UUID_VARIANT_RFC4122;

  return bytes.toString('hex').replace(UUID_HEX_GROUPS, '$1-$2-$3-$4-$5');
}

export function buildCatalogDatasetRows(
  dataset: CatalogDataset,
): CatalogDatasetRows {
  return {
    images: dataset.images.map((image) => ({
      id: image.id,
      publicId: image.publicId,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      format: image.format,
    })),
    roomTypes: dataset.roomTypes.map((roomType) => ({
      id: roomType.id,
      code: roomType.code,
      name: roomType.name,
      sortOrder: roomType.sortOrder,
    })),
    materialTypes: dataset.materialTypes.map((materialType) => ({
      id: materialType.id,
      code: materialType.code,
      name: materialType.name,
      status: materialType.status,
    })),
    categories: dataset.categories.map((category) => ({
      id: category.id,
      name: category.name,
      wastePercent: category.wastePercent,
      surface: category.surface,
      status: category.status,
    })),
    roomTypeCategories: dataset.roomTypes.flatMap((roomType) =>
      roomType.categoryIds.map((categoryId, sortOrder) => ({
        roomTypeId: roomType.id,
        categoryId,
        sortOrder,
      })),
    ),
    products: dataset.products.map((product) => ({
      id: product.id,
      categoryId: product.categoryId,
      materialTypeId: product.materialTypeId,
      name: product.name,
      description: product.description,
      brand: product.brand,
      manufacturer: product.manufacturer,
      color: product.color,
      size: product.size,
      priceCents: product.priceCents,
      unit: product.unit,
      wastePercentOverride: product.wastePercentOverride,
      heatedFloorCompatible: product.heatedFloorCompatible,
      textureImageId: product.textureImageId,
      tileWidthMm: product.tileWidthMm,
      tileLengthMm: product.tileLengthMm,
      fallbackColor: product.fallbackColor,
      status: product.status,
    })),
    productImages: dataset.products.flatMap((product) =>
      product.images.map((image) => ({
        productId: product.id,
        imageId: image.imageId,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
    ),
    productAttributes: dataset.products.flatMap((product) =>
      product.attributes.map((attribute, index) => ({
        id: deriveProductAttributeId(product.id, index),
        productId: product.id,
        name: attribute.name,
        value: attribute.value,
        sortOrder: attribute.sortOrder,
      })),
    ),
    styles: dataset.styles.map((style) => ({
      id: style.id,
      name: style.name,
      description: style.description,
      imageId: style.imageId,
      sortOrder: style.sortOrder,
      status: style.status,
    })),
    styleDefaultMaterials: dataset.styles.flatMap((style) =>
      style.defaultMaterials.map((pair) => ({
        styleId: style.id,
        roomTypeId: pair.roomTypeId,
        categoryId: pair.categoryId,
        productId: pair.productId,
      })),
    ),
    engineeringItems: dataset.engineeringItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      includedInBase: item.includedInBase,
      priceCents: item.priceCents,
      unit: item.unit,
      sortOrder: item.sortOrder,
      status: item.status,
    })),
    options: dataset.options.map((option) => ({
      id: option.id,
      kind: option.kind,
      name: option.name,
      description: option.description,
      imageId: option.imageId,
      priceCents: option.priceCents,
      unit: option.unit,
      minQuantity: option.minQuantity,
      maxQuantity: option.maxQuantity,
      sortOrder: option.sortOrder,
      status: option.status,
    })),
    optionRoomTypes: dataset.options.flatMap((option) =>
      option.roomTypeIds.map((roomTypeId) => ({
        optionId: option.id,
        roomTypeId,
      })),
    ),
  };
}

function rewrittenBySeed() {
  return { revision: randomUUID(), updatedById: null };
}

function maxOf(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}

@Injectable()
export class CatalogDatasetService {
  async upsert(
    dataset: CatalogDataset,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const rows = buildCatalogDatasetRows(dataset);
    const productIds = rows.products.map((product) => product.id);
    const styleIds = rows.styles.map((style) => style.id);
    const optionIds = rows.options.map((option) => option.id);

    for (const image of rows.images) {
      const { id, ...data } = image;
      await tx.image.upsert({
        where: { id },
        create: image,
        update: data,
      });
    }

    await this.upsertRoomTypes(rows, tx);

    for (const materialType of rows.materialTypes) {
      await tx.materialType.upsert({
        where: { code: materialType.code },
        create: materialType,
        update: { ...materialType, ...rewrittenBySeed() },
      });
    }

    for (const category of rows.categories) {
      await tx.category.upsert({
        where: { id: category.id },
        create: category,
        update: { ...category, ...rewrittenBySeed() },
      });
    }

    await this.syncRoomTypeCategories(dataset, rows, tx);

    for (const product of rows.products) {
      await tx.product.upsert({
        where: { id: product.id },
        create: product,
        update: { ...product, ...rewrittenBySeed() },
      });
    }

    await tx.productImage.deleteMany({
      where: { productId: { in: productIds } },
    });
    await tx.productAttribute.deleteMany({
      where: { productId: { in: productIds } },
    });

    for (const style of rows.styles) {
      await tx.style.upsert({
        where: { id: style.id },
        create: style,
        update: { ...style, ...rewrittenBySeed() },
      });
    }

    await tx.styleDefaultMaterial.deleteMany({
      where: { styleId: { in: styleIds } },
    });

    for (const item of rows.engineeringItems) {
      await tx.engineeringPackageItem.upsert({
        where: { id: item.id },
        create: item,
        update: { ...item, ...rewrittenBySeed() },
      });
    }

    await this.reorderExistingOptions(optionIds, rows, tx);

    for (const option of rows.options) {
      await tx.option.upsert({
        where: { id: option.id },
        create: option,
        update: { ...option, ...rewrittenBySeed() },
      });
    }

    await tx.optionRoomType.deleteMany({
      where: { optionId: { in: optionIds } },
    });

    await this.insertChildren(rows, tx);
  }

  async replace(
    dataset: CatalogDataset,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const rows = buildCatalogDatasetRows(dataset);

    await tx.styleDefaultMaterial.deleteMany({});
    await tx.optionRoomType.deleteMany({});
    await tx.productAttribute.deleteMany({});
    await tx.productImage.deleteMany({});
    await tx.product.deleteMany({});
    await tx.roomTypeCategory.deleteMany({});
    await tx.option.deleteMany({});
    await tx.engineeringPackageItem.deleteMany({});
    await tx.style.deleteMany({});
    await tx.category.deleteMany({});
    await tx.materialType.deleteMany({});
    await tx.image.deleteMany({
      where: {
        OR: [
          { publicId: { startsWith: `${CLOUDINARY_UPLOAD_FOLDER}/` } },
          { publicId: { in: dataset.images.map((image) => image.publicId) } },
          { id: { in: dataset.images.map((image) => image.id) } },
        ],
      },
    });

    await this.upsertRoomTypes(rows, tx);

    await tx.image.createMany({ data: rows.images });
    await tx.materialType.createMany({ data: rows.materialTypes });
    await tx.category.createMany({ data: rows.categories });
    await tx.product.createMany({ data: rows.products });
    await tx.style.createMany({ data: rows.styles });
    await tx.engineeringPackageItem.createMany({ data: rows.engineeringItems });
    await tx.option.createMany({ data: rows.options });

    await this.insertChildren(rows, tx);
  }

  private async upsertRoomTypes(
    rows: CatalogDatasetRows,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const roomType of rows.roomTypes) {
      await tx.roomType.upsert({
        where: { code: roomType.code },
        create: roomType,
        update: { ...roomType, ...rewrittenBySeed() },
      });
    }
  }

  private async syncRoomTypeCategories(
    dataset: CatalogDataset,
    rows: CatalogDatasetRows,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const roomTypeIds = dataset.roomTypes.map((roomType) => roomType.id);
    const existing = await tx.roomTypeCategory.findMany({
      where: { roomTypeId: { in: roomTypeIds } },
      select: { roomTypeId: true, categoryId: true, sortOrder: true },
      orderBy: [{ roomTypeId: 'asc' }, { sortOrder: 'asc' }],
    });

    if (existing.length === 0) {
      return;
    }

    const seededOrder = new Map(
      rows.roomTypeCategories.map((row) => [
        `${row.roomTypeId}:${row.categoryId}`,
        row.sortOrder,
      ]),
    );
    const nextAdminOrder = new Map(
      dataset.roomTypes.map((roomType) => [
        roomType.id,
        roomType.categoryIds.length,
      ]),
    );
    const finalOrder = existing.map((link) => {
      const seeded = seededOrder.get(`${link.roomTypeId}:${link.categoryId}`);
      if (seeded !== undefined) {
        return { ...link, sortOrder: seeded };
      }
      const sortOrder = nextAdminOrder.get(link.roomTypeId) ?? 0;
      nextAdminOrder.set(link.roomTypeId, sortOrder + 1);
      return { ...link, sortOrder };
    });

    await tx.roomTypeCategory.updateMany({
      where: { roomTypeId: { in: roomTypeIds } },
      data: {
        sortOrder: {
          decrement: maxOf(existing.map((link) => link.sortOrder)) + 1,
        },
      },
    });

    for (const { roomTypeId, categoryId, sortOrder } of finalOrder) {
      await tx.roomTypeCategory.update({
        where: { roomTypeId_categoryId: { roomTypeId, categoryId } },
        data: { sortOrder },
      });
    }
  }

  private async reorderExistingOptions(
    optionIds: string[],
    rows: CatalogDatasetRows,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const kinds = [...new Set(rows.options.map((option) => option.kind))];
    const existing = await tx.option.findMany({
      where: { OR: [{ kind: { in: kinds } }, { id: { in: optionIds } }] },
      select: { id: true, kind: true, sortOrder: true },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    });

    if (existing.length === 0) {
      return;
    }

    await tx.option.updateMany({
      where: { id: { in: existing.map((option) => option.id) } },
      data: {
        sortOrder: {
          decrement: maxOf(existing.map((option) => option.sortOrder)) + 1,
        },
      },
    });

    const seededIds = new Set(optionIds);
    const nextAdminOrder = new Map(
      kinds.map((kind) => [
        kind,
        maxOf(
          rows.options
            .filter((option) => option.kind === kind)
            .map((option) => option.sortOrder + 1),
        ),
      ]),
    );

    for (const option of existing) {
      if (seededIds.has(option.id)) {
        continue;
      }
      const sortOrder = nextAdminOrder.get(option.kind) ?? 0;
      nextAdminOrder.set(option.kind, sortOrder + 1);
      await tx.option.update({
        where: { id: option.id },
        data: { sortOrder },
      });
    }
  }

  private async insertChildren(
    rows: CatalogDatasetRows,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.roomTypeCategory.createMany({
      data: rows.roomTypeCategories,
      skipDuplicates: true,
    });
    await tx.productImage.createMany({ data: rows.productImages });
    await tx.productAttribute.createMany({ data: rows.productAttributes });
    await tx.styleDefaultMaterial.createMany({
      data: rows.styleDefaultMaterials,
    });
    await tx.optionRoomType.createMany({ data: rows.optionRoomTypes });
  }
}
