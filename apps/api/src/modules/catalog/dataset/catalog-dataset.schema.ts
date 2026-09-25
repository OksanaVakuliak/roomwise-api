import { z } from 'zod';
import {
  localizedDescriptionSchema,
  localizedNameSchema,
} from '../../../common/i18n/localized-text.schema';
import {
  OptionKind,
  OptionUnit,
  ProductUnit,
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { FALLBACK_COLOR_PATTERN } from '../common/fallback-color.schema';

export const MATERIAL_TYPE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
export const PRODUCT_TEXT_FIELD_MAX_LENGTH = 80;
export const PERCENT_MAX = 100;
export const PRODUCT_MAX_ATTRIBUTES = 30;
export const OPTION_QUANTITY_MAX = 100;

function findDuplicate(ids: string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

export const seedImageSchema = z.object({
  id: z.uuid(),
  publicId: z.string().startsWith('roomwise/seed/'),
  sourceUrl: z.url(),
  width: z.int().positive(),
  height: z.int().positive(),
  bytes: z.int().positive(),
  format: z.enum(['jpg', 'png', 'webp']),
});
export type SeedImage = z.infer<typeof seedImageSchema>;

export const seedRoomTypeSchema = z.object({
  id: z.uuid(),
  code: z.enum(RoomTypeCode),
  name: localizedNameSchema,
  sortOrder: z.int().nonnegative(),
  categoryIds: z.array(z.uuid()).min(1),
});
export type SeedRoomType = z.infer<typeof seedRoomTypeSchema>;

export const seedMaterialTypeSchema = z.object({
  id: z.uuid(),
  code: z.string().regex(MATERIAL_TYPE_CODE_PATTERN),
  name: localizedNameSchema,
  status: z.enum(PublicationStatus),
});
export type SeedMaterialType = z.infer<typeof seedMaterialTypeSchema>;

export const seedCategorySchema = z.object({
  id: z.uuid(),
  name: localizedNameSchema,
  wastePercent: z.number().min(0).max(PERCENT_MAX),
  surface: z.enum(SurfaceKind),
  status: z.enum(PublicationStatus),
});
export type SeedCategory = z.infer<typeof seedCategorySchema>;

export const seedProductImageSchema = z.object({
  imageId: z.uuid(),
  sortOrder: z.int().nonnegative(),
  isPrimary: z.boolean(),
});
export type SeedProductImage = z.infer<typeof seedProductImageSchema>;

export const seedProductAttributeSchema = z.object({
  name: localizedNameSchema,
  value: localizedNameSchema,
  sortOrder: z.int().nonnegative(),
});
export type SeedProductAttribute = z.infer<typeof seedProductAttributeSchema>;

export const seedProductSchema = z
  .object({
    id: z.uuid(),
    categoryId: z.uuid(),
    materialTypeId: z.uuid(),
    name: localizedNameSchema,
    description: localizedDescriptionSchema,
    brand: z.string().min(1).max(PRODUCT_TEXT_FIELD_MAX_LENGTH),
    manufacturer: z.string().min(1).max(PRODUCT_TEXT_FIELD_MAX_LENGTH),
    color: localizedNameSchema,
    size: localizedNameSchema,
    priceCents: z.int().nonnegative(),
    unit: z.enum(ProductUnit),
    wastePercentOverride: z.number().min(0).max(PERCENT_MAX).nullable(),
    heatedFloorCompatible: z.boolean(),
    textureImageId: z.uuid().nullable(),
    tileWidthMm: z.int().positive().nullable(),
    tileLengthMm: z.int().positive().nullable(),
    fallbackColor: z.string().regex(FALLBACK_COLOR_PATTERN).nullable(),
    status: z.enum(PublicationStatus),
    images: z.array(seedProductImageSchema).min(1),
    attributes: z.array(seedProductAttributeSchema).max(PRODUCT_MAX_ATTRIBUTES),
  })
  .superRefine((product, ctx) => {
    const primaryCount = product.images.filter(
      (image) => image.isPrimary,
    ).length;
    if (primaryCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Product must have exactly one primary image',
        path: ['images'],
      });
    }

    const duplicateImageId = findDuplicate(
      product.images.map((image) => image.imageId),
    );
    if (duplicateImageId) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate image id ${duplicateImageId}`,
        path: ['images'],
      });
    }
  });
export type SeedProduct = z.infer<typeof seedProductSchema>;

export const seedStyleDefaultMaterialSchema = z.object({
  roomTypeId: z.uuid(),
  categoryId: z.uuid(),
  productId: z.uuid(),
});
export type SeedStyleDefaultMaterial = z.infer<
  typeof seedStyleDefaultMaterialSchema
>;

export const seedStyleSchema = z
  .object({
    id: z.uuid(),
    name: localizedNameSchema,
    description: localizedDescriptionSchema,
    imageId: z.uuid().nullable(),
    sortOrder: z.int().nonnegative(),
    status: z.enum(PublicationStatus),
    defaultMaterials: z.array(seedStyleDefaultMaterialSchema),
  })
  .superRefine((style, ctx) => {
    const pairKey = (pair: { roomTypeId: string; categoryId: string }) =>
      `${pair.roomTypeId}:${pair.categoryId}`;
    const duplicatePair = findDuplicate(style.defaultMaterials.map(pairKey));
    if (duplicatePair) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate room type and category pair ${duplicatePair}`,
        path: ['defaultMaterials'],
      });
    }
  });
export type SeedStyle = z.infer<typeof seedStyleSchema>;

export const seedEngineeringPackageItemSchema = z
  .object({
    id: z.uuid(),
    name: localizedNameSchema,
    description: localizedDescriptionSchema,
    includedInBase: z.boolean(),
    priceCents: z.int().nonnegative().nullable(),
    unit: z.enum(OptionUnit).nullable(),
    sortOrder: z.int().nonnegative(),
    status: z.enum(PublicationStatus),
  })
  .superRefine((item, ctx) => {
    if (item.includedInBase) return;

    if (item.priceCents === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'priceCents is required when includedInBase is false',
        path: ['priceCents'],
      });
    }
    if (item.unit === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'unit is required when includedInBase is false',
        path: ['unit'],
      });
    }
  });
export type SeedEngineeringPackageItem = z.infer<
  typeof seedEngineeringPackageItemSchema
>;

export const seedOptionSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(OptionKind),
    name: localizedNameSchema,
    description: localizedDescriptionSchema,
    imageId: z.uuid().nullable(),
    priceCents: z.int().nonnegative(),
    unit: z.enum(OptionUnit),
    minQuantity: z.int().min(1).max(OPTION_QUANTITY_MAX).nullable(),
    maxQuantity: z.int().min(1).max(OPTION_QUANTITY_MAX).nullable(),
    sortOrder: z.int().nonnegative(),
    status: z.enum(PublicationStatus),
    roomTypeIds: z.array(z.uuid()),
  })
  .superRefine((option, ctx) => {
    if (option.unit === 'PIECE') {
      if (option.minQuantity === null || option.maxQuantity === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'minQuantity and maxQuantity are required for PIECE unit',
          path: ['minQuantity'],
        });
      } else if (option.minQuantity > option.maxQuantity) {
        ctx.addIssue({
          code: 'custom',
          message: 'minQuantity must be <= maxQuantity',
          path: ['minQuantity'],
        });
      }
    } else if (option.minQuantity !== null || option.maxQuantity !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'minQuantity and maxQuantity are only allowed for PIECE unit',
        path: ['minQuantity'],
      });
    }

    const perRoom = option.unit === 'ROOM_SQM' || option.unit === 'ROOM';
    if (!perRoom && option.roomTypeIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'roomTypeIds are only allowed for ROOM_SQM or ROOM unit',
        path: ['roomTypeIds'],
      });
    }
  });
export type SeedOption = z.infer<typeof seedOptionSchema>;

export const catalogDatasetSchema = z
  .object({
    images: z.array(seedImageSchema),
    roomTypes: z.array(seedRoomTypeSchema),
    materialTypes: z.array(seedMaterialTypeSchema),
    categories: z.array(seedCategorySchema),
    products: z.array(seedProductSchema),
    styles: z.array(seedStyleSchema),
    engineeringItems: z.array(seedEngineeringPackageItemSchema),
    options: z.array(seedOptionSchema),
  })
  .superRefine((dataset, ctx) => {
    const duplicateImageId = findDuplicate(
      dataset.images.map((image) => image.id),
    );
    if (duplicateImageId) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate image id ${duplicateImageId}`,
        path: ['images'],
      });
    }

    const duplicateRoomTypeId = findDuplicate(
      dataset.roomTypes.map((roomType) => roomType.id),
    );
    if (duplicateRoomTypeId) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate room type id ${duplicateRoomTypeId}`,
        path: ['roomTypes'],
      });
    }
    const duplicateRoomTypeCode = findDuplicate(
      dataset.roomTypes.map((roomType) => roomType.code),
    );
    if (duplicateRoomTypeCode) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate room type code ${duplicateRoomTypeCode}`,
        path: ['roomTypes'],
      });
    }

    const duplicateMaterialTypeId = findDuplicate(
      dataset.materialTypes.map((materialType) => materialType.id),
    );
    if (duplicateMaterialTypeId) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate material type id ${duplicateMaterialTypeId}`,
        path: ['materialTypes'],
      });
    }
    const duplicateMaterialTypeCode = findDuplicate(
      dataset.materialTypes.map((materialType) => materialType.code),
    );
    if (duplicateMaterialTypeCode) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate material type code ${duplicateMaterialTypeCode}`,
        path: ['materialTypes'],
      });
    }

    const categoryIds = new Set(
      dataset.categories.map((category) => category.id),
    );
    const duplicateCategoryId = findDuplicate(
      dataset.categories.map((category) => category.id),
    );
    if (duplicateCategoryId) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate category id ${duplicateCategoryId}`,
        path: ['categories'],
      });
    }

    const imageIds = new Set(dataset.images.map((image) => image.id));
    const materialTypeIds = new Set(
      dataset.materialTypes.map((materialType) => materialType.id),
    );
    const roomTypeIds = new Set(
      dataset.roomTypes.map((roomType) => roomType.id),
    );

    const roomTypeCategorySets = new Map<string, Set<string>>();

    dataset.roomTypes.forEach((roomType, roomTypeIndex) => {
      const duplicateCategoryInRoomType = findDuplicate(roomType.categoryIds);
      if (duplicateCategoryInRoomType) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate category ${duplicateCategoryInRoomType} in room type ${roomType.code}`,
          path: ['roomTypes', roomTypeIndex, 'categoryIds'],
        });
      }

      roomType.categoryIds.forEach((categoryId, categoryIndex) => {
        if (!categoryIds.has(categoryId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Room type ${roomType.code} references unknown category ${categoryId}`,
            path: ['roomTypes', roomTypeIndex, 'categoryIds', categoryIndex],
          });
        }
      });

      roomTypeCategorySets.set(roomType.id, new Set(roomType.categoryIds));
    });

    const categorySurfaceById = new Map(
      dataset.categories.map(
        (category) => [category.id, category.surface] as const,
      ),
    );

    const productCategoryById = new Map<string, string>();

    dataset.products.forEach((product, productIndex) => {
      if (!categoryIds.has(product.categoryId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Product ${product.id} references unknown category ${product.categoryId}`,
          path: ['products', productIndex, 'categoryId'],
        });
      }
      if (!materialTypeIds.has(product.materialTypeId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Product ${product.id} references unknown material type ${product.materialTypeId}`,
          path: ['products', productIndex, 'materialTypeId'],
        });
      }

      product.images.forEach((image, imageIndex) => {
        if (!imageIds.has(image.imageId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Product ${product.id} references unknown image ${image.imageId}`,
            path: ['products', productIndex, 'images', imageIndex, 'imageId'],
          });
        }
      });

      if (product.textureImageId && !imageIds.has(product.textureImageId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Product ${product.id} references unknown texture image ${product.textureImageId}`,
          path: ['products', productIndex, 'textureImageId'],
        });
      }

      const surface = categorySurfaceById.get(product.categoryId);
      if (surface && surface !== 'NONE') {
        const missingSurfaceFields =
          product.textureImageId === null ||
          product.tileWidthMm === null ||
          product.tileLengthMm === null ||
          product.fallbackColor === null;
        if (missingSurfaceFields) {
          ctx.addIssue({
            code: 'custom',
            message: `Product ${product.id} is in a surface category and must have textureImageId, tileWidthMm, tileLengthMm and fallbackColor`,
            path: ['products', productIndex],
          });
        }
      }

      productCategoryById.set(product.id, product.categoryId);
    });

    dataset.styles.forEach((style, styleIndex) => {
      if (style.imageId && !imageIds.has(style.imageId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Style ${style.id} references unknown image ${style.imageId}`,
          path: ['styles', styleIndex, 'imageId'],
        });
      }

      style.defaultMaterials.forEach((pair, pairIndex) => {
        if (!roomTypeIds.has(pair.roomTypeId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Style ${style.id} references unknown room type ${pair.roomTypeId}`,
            path: [
              'styles',
              styleIndex,
              'defaultMaterials',
              pairIndex,
              'roomTypeId',
            ],
          });
        }
        if (!categoryIds.has(pair.categoryId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Style ${style.id} references unknown category ${pair.categoryId}`,
            path: [
              'styles',
              styleIndex,
              'defaultMaterials',
              pairIndex,
              'categoryId',
            ],
          });
        }

        const roomTypeCategorySet = roomTypeCategorySets.get(pair.roomTypeId);
        if (roomTypeCategorySet && !roomTypeCategorySet.has(pair.categoryId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Style ${style.id}: category ${pair.categoryId} is not in room type ${pair.roomTypeId}`,
            path: ['styles', styleIndex, 'defaultMaterials', pairIndex],
          });
        }

        const productCategoryId = productCategoryById.get(pair.productId);
        if (productCategoryId === undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `Style ${style.id} references unknown product ${pair.productId}`,
            path: [
              'styles',
              styleIndex,
              'defaultMaterials',
              pairIndex,
              'productId',
            ],
          });
        } else if (productCategoryId !== pair.categoryId) {
          ctx.addIssue({
            code: 'custom',
            message: `Style ${style.id}: product ${pair.productId} does not belong to category ${pair.categoryId}`,
            path: [
              'styles',
              styleIndex,
              'defaultMaterials',
              pairIndex,
              'productId',
            ],
          });
        }
      });
    });

    dataset.options.forEach((option, optionIndex) => {
      if (option.imageId && !imageIds.has(option.imageId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Option ${option.id} references unknown image ${option.imageId}`,
          path: ['options', optionIndex, 'imageId'],
        });
      }

      option.roomTypeIds.forEach((roomTypeId, roomTypeIndex) => {
        if (!roomTypeIds.has(roomTypeId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Option ${option.id} references unknown room type ${roomTypeId}`,
            path: ['options', optionIndex, 'roomTypeIds', roomTypeIndex],
          });
        }
      });
    });
  });

export type CatalogDataset = z.infer<typeof catalogDatasetSchema>;
