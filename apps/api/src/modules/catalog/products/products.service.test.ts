import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ProductUnit,
  PublicationStatus,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import type { ImageUrlBuilder } from '../images/image-urls';
import { ProductsService } from './products.service';

const PRODUCT_ID = 'product-1';
const CATEGORY_ID = 'category-1';
const MATERIAL_TYPE_ID = 'material-type-1';
const IMAGE_ID = 'image-1';
const IMAGE_ID_2 = 'image-2';
const ADMIN_ID = 'admin-1';
const REVISION = 'revision-1';
const NEXT_REVISION = 'revision-2';
const STYLE_ID = 'style-1';

function localized(en: string, uk: string) {
  return { en, uk };
}

function imageSource(id: string, publicId = `public-${id}`) {
  return { id, publicId };
}

function createImageUrls(): ImageUrlBuilder {
  return {
    toImageRef: vi.fn((image: { id: string; publicId: string }) => ({
      id: image.id,
      thumb: `thumb/${image.publicId}`,
      card: `card/${image.publicId}`,
      zoom: `zoom/${image.publicId}`,
    })),
    toTextureRef: vi.fn((image: { id: string; publicId: string }) => ({
      id: image.id,
      url: `texture/${image.publicId}`,
    })),
  } as unknown as ImageUrlBuilder;
}

function createProductAdminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    categoryId: CATEGORY_ID,
    materialTypeId: MATERIAL_TYPE_ID,
    name: localized('Laminate', 'Ламінат'),
    description: localized('Oak laminate', 'Дубовий ламінат'),
    brand: 'Floorwise',
    manufacturer: 'Floorwise Mfg',
    color: localized('Oak', 'Дуб'),
    size: localized('1380x193', '1380x193'),
    priceCents: 1800,
    unit: ProductUnit.SQM,
    wastePercentOverride: null,
    heatedFloorCompatible: true,
    textureImageId: null,
    tileWidthMm: null,
    tileLengthMm: null,
    fallbackColor: null,
    status: PublicationStatus.DRAFT,
    revision: REVISION,
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    category: { surface: SurfaceKind.NONE },
    images: [{ isPrimary: true, image: imageSource(IMAGE_ID) }],
    attributes: [],
    textureImage: null,
    ...overrides,
  };
}

function validationRow(overrides: Record<string, unknown> = {}) {
  const row = createProductAdminRow(overrides);

  return {
    name: row.name,
    description: row.description,
    color: row.color,
    size: row.size,
    textureImageId: row.textureImageId,
    tileWidthMm: row.tileWidthMm,
    tileLengthMm: row.tileLengthMm,
    fallbackColor: row.fallbackColor,
    category: row.category,
    images: row.images.map((image) => ({ isPrimary: image.isPrimary })),
    attributes: row.attributes,
  };
}

function patchExistingRow(overrides: Record<string, unknown> = {}) {
  const row = createProductAdminRow(overrides);

  return {
    categoryId: row.categoryId,
    materialTypeId: row.materialTypeId,
    status: row.status,
    name: row.name,
    description: row.description,
    color: row.color,
    size: row.size,
    priceCents: row.priceCents,
    textureImageId: row.textureImageId,
    tileWidthMm: row.tileWidthMm,
    tileLengthMm: row.tileLengthMm,
    fallbackColor: row.fallbackColor,
    category: row.category,
    images: row.images.map((image) => ({ isPrimary: image.isPrimary })),
    attributes: row.attributes,
  };
}

function createPrisma(overrides: Record<string, unknown> = {}) {
  const tx = {
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productImage: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    productAttribute: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const base = {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(createProductAdminRow()),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(createProductAdminRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    category: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: CATEGORY_ID, surface: SurfaceKind.NONE }),
    },
    materialType: {
      findUnique: vi.fn().mockResolvedValue({ id: MATERIAL_TYPE_ID }),
    },
    image: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: IMAGE_ID }, { id: IMAGE_ID_2 }]),
    },
    styleDefaultMaterial: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<number>) =>
      run(tx),
    ),
    tx,
  };

  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const existing = merged[key];
    merged[key] =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? {
            ...(existing as Record<string, unknown>),
            ...(value as Record<string, unknown>),
          }
        : value;
  }

  return merged as unknown as PrismaService & { tx: typeof tx };
}

function createProductInput(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: CATEGORY_ID,
    materialTypeId: MATERIAL_TYPE_ID,
    name: localized('Laminate', 'Ламінат'),
    description: localized('Oak laminate', 'Дубовий ламінат'),
    brand: 'Floorwise',
    manufacturer: 'Floorwise Mfg',
    color: localized('Oak', 'Дуб'),
    size: localized('1380x193', '1380x193'),
    priceCents: 1800,
    confirmZeroPrice: false,
    unit: ProductUnit.SQM,
    wastePercentOverride: null,
    heatedFloorCompatible: true,
    images: [{ imageId: IMAGE_ID, isPrimary: true }],
    attributes: [],
    textureImageId: null,
    tileWidthMm: null,
    tileLengthMm: null,
    fallbackColor: null,
    ...overrides,
  };
}

describe('ProductsService.list', () => {
  it('filters by category and status and paginates deterministically', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: localized('Laminate', 'Ламінат'),
        categoryId: CATEGORY_ID,
        status: PublicationStatus.DRAFT,
        priceCents: 1800,
        unit: ProductUnit.SQM,
        updatedAt: new Date('2026-09-24T00:00:00.000Z'),
        updatedBy: { id: ADMIN_ID, login: 'admin' },
        images: [{ image: imageSource(IMAGE_ID) }],
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = createPrisma({ product: { findMany, count } });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.list({
      categoryId: CATEGORY_ID,
      status: PublicationStatus.DRAFT,
      page: 1,
      pageSize: 50,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: CATEGORY_ID, status: PublicationStatus.DRAFT },
        skip: 0,
        take: 50,
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: PRODUCT_ID,
        image: expect.objectContaining({ id: IMAGE_ID }),
      }),
    ]);
    expect(result.total).toBe(1);
  });
});

describe('ProductsService.get', () => {
  it('throws NOT_FOUND for an unknown product', async () => {
    const prisma = createPrisma({
      product: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(service.get(PRODUCT_ID)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('maps images, texture and attributes for an existing product', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi.fn().mockResolvedValue(
          createProductAdminRow({
            attributes: [
              {
                name: localized('Thickness', 'Товщина'),
                value: localized('8mm', '8мм'),
              },
            ],
            textureImage: imageSource('texture-image'),
          }),
        ),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.get(PRODUCT_ID);

    expect(result.images).toEqual([
      expect.objectContaining({ id: IMAGE_ID, isPrimary: true }),
    ]);
    expect(result.attributes).toEqual([
      {
        name: localized('Thickness', 'Товщина'),
        value: localized('8mm', '8мм'),
      },
    ]);
    expect(result.texture).toEqual({
      id: 'texture-image',
      url: 'texture/public-texture-image',
    });
  });
});

describe('ProductsService.create', () => {
  it('creates a draft product with ordered images and attributes', async () => {
    const create = vi.fn().mockResolvedValue(createProductAdminRow());
    const prisma = createPrisma({ product: { create } });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.create(
      createProductInput({
        images: [
          { imageId: IMAGE_ID, isPrimary: false },
          { imageId: IMAGE_ID_2, isPrimary: true },
        ],
        attributes: [
          {
            name: localized('Thickness', 'Товщина'),
            value: localized('8mm', '8мм'),
          },
        ],
      }),
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublicationStatus.DRAFT,
          updatedById: ADMIN_ID,
          images: {
            create: [
              { imageId: IMAGE_ID, isPrimary: false, sortOrder: 0 },
              { imageId: IMAGE_ID_2, isPrimary: true, sortOrder: 1 },
            ],
          },
          attributes: {
            create: [
              {
                name: localized('Thickness', 'Товщина'),
                value: localized('8mm', '8мм'),
                sortOrder: 0,
              },
            ],
          },
        }),
      }),
    );
    expect(result.status).toBe(PublicationStatus.DRAFT);
  });

  it('rejects an unknown category with CATEGORY_NOT_FOUND', async () => {
    const prisma = createPrisma({
      category: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.create(createProductInput(), ADMIN_ID),
    ).rejects.toMatchObject({ code: ERROR_CODES.CATEGORY_NOT_FOUND });
  });

  it('rejects an unknown material type', async () => {
    const prisma = createPrisma({
      materialType: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.create(createProductInput(), ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MATERIAL_TYPE_NOT_FOUND,
      params: { materialTypeId: MATERIAL_TYPE_ID },
    });
  });

  it('rejects referenced image ids that do not exist', async () => {
    const prisma = createPrisma({
      image: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.create(createProductInput(), ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.IMAGE_NOT_FOUND,
      params: { imageIds: [IMAGE_ID] },
    });
  });

  it('rejects a zero price without confirmation', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.create(
        createProductInput({ priceCents: 0, confirmZeroPrice: false }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.ZERO_PRICE_NOT_CONFIRMED });
  });

  it('allows a zero price when confirmed', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(createProductAdminRow({ priceCents: 0 }));
    const prisma = createPrisma({ product: { create } });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.create(
      createProductInput({ priceCents: 0, confirmZeroPrice: true }),
      ADMIN_ID,
    );

    expect(result.priceCents).toBe(0);
  });
});

describe('ProductsService.update', () => {
  it('applies a partial patch, replacing images and attributes wholesale', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(patchExistingRow())
          .mockResolvedValueOnce(createProductAdminRow({ priceCents: 2000 })),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.update(
      PRODUCT_ID,
      {
        priceCents: 2000,
        confirmZeroPrice: false,
        images: [{ imageId: IMAGE_ID_2, isPrimary: true }],
        attributes: [
          {
            name: localized('Thickness', 'Товщина'),
            value: localized('8mm', '8мм'),
          },
        ],
        revision: REVISION,
      },
      ADMIN_ID,
    );

    expect(prisma.tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, revision: REVISION },
      data: expect.objectContaining({
        priceCents: 2000,
        updatedById: ADMIN_ID,
      }),
    });
    expect(prisma.tx.productImage.deleteMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID },
    });
    expect(prisma.tx.productImage.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: PRODUCT_ID,
          imageId: IMAGE_ID_2,
          isPrimary: true,
          sortOrder: 0,
        },
      ],
    });
    expect(prisma.tx.productAttribute.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: PRODUCT_ID,
          name: localized('Thickness', 'Товщина'),
          value: localized('8mm', '8мм'),
          sortOrder: 0,
        },
      ],
    });
    expect(result.id).toBe(PRODUCT_ID);
  });

  it('throws STALE_REVISION when the revision no longer matches', async () => {
    const prisma = createPrisma({
      tx: {
        product: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        productImage: { deleteMany: vi.fn(), createMany: vi.fn() },
        productAttribute: { deleteMany: vi.fn(), createMany: vi.fn() },
      },
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(patchExistingRow())
          .mockResolvedValueOnce({ revision: NEXT_REVISION }),
      },
    });
    prisma.$transaction = vi.fn(async (run) => run(prisma.tx));
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.update(PRODUCT_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: NEXT_REVISION },
    });
  });

  it('rejects a patch that would leave a published product without a primary image', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            patchExistingRow({ status: PublicationStatus.PUBLISHED }),
          ),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.update(
        PRODUCT_ID,
        {
          images: [{ imageId: IMAGE_ID, isPrimary: false }],
          revision: REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRIMARY_IMAGE_MISSING });
  });

  it('rejects a patch that would leave a published surface product without surface data', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi.fn().mockResolvedValue(
          patchExistingRow({
            status: PublicationStatus.PUBLISHED,
            category: { surface: SurfaceKind.FLOOR },
          }),
        ),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.update(PRODUCT_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.SURFACE_DATA_MISSING,
      params: { missing: ['texture', 'tileSize', 'fallbackColor'] },
    });
  });

  it('rejects an unknown category on patch', async () => {
    const prisma = createPrisma({
      product: { findUnique: vi.fn().mockResolvedValue(patchExistingRow()) },
      category: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.update(
        PRODUCT_ID,
        { categoryId: 'category-2', revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.CATEGORY_NOT_FOUND });
  });
});

describe('ProductsService.changeStatus', () => {
  it('publishes when translations, surface data and primary image are present', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(validationRow())
          .mockResolvedValueOnce(
            createProductAdminRow({ status: PublicationStatus.PUBLISHED }),
          ),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.changeStatus(
      PRODUCT_ID,
      { status: PublicationStatus.PUBLISHED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.status).toBe(PublicationStatus.PUBLISHED);
    expect(prisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublicationStatus.PUBLISHED,
        }),
      }),
    );
  });

  it('rejects publishing when a translation is missing, naming the field', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue(validationRow({ color: localized('Oak', '') })),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.changeStatus(
        PRODUCT_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.TRANSLATION_MISSING,
      params: { fields: ['color.uk'] },
    });
  });

  it('rejects publishing a surface product missing texture, tile size and fallback color', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            validationRow({ category: { surface: SurfaceKind.FLOOR } }),
          ),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.changeStatus(
        PRODUCT_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.SURFACE_DATA_MISSING,
      params: { missing: ['texture', 'tileSize', 'fallbackColor'] },
    });
  });

  it('rejects publishing without a primary image', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi.fn().mockResolvedValue(validationRow({ images: [] })),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(
      service.changeStatus(
        PRODUCT_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRIMARY_IMAGE_MISSING });
  });

  it('archives a product used as a style default material with a deduplicated warning', async () => {
    const styleDefaultMaterialFindMany = vi.fn().mockResolvedValue([
      {
        style: {
          id: STYLE_ID,
          name: localized('Scandinavian', 'Скандинавський'),
        },
      },
      {
        style: {
          id: STYLE_ID,
          name: localized('Scandinavian', 'Скандинавський'),
        },
      },
    ]);
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(validationRow())
          .mockResolvedValueOnce(
            createProductAdminRow({ status: PublicationStatus.ARCHIVED }),
          ),
      },
      styleDefaultMaterial: { findMany: styleDefaultMaterialFindMany },
    });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.changeStatus(
      PRODUCT_ID,
      { status: PublicationStatus.ARCHIVED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.warnings).toEqual([
      {
        code: 'USED_AS_DEFAULT_MATERIAL',
        params: {
          styles: [
            { id: STYLE_ID, name: localized('Scandinavian', 'Скандинавський') },
          ],
        },
      },
    ]);
  });

  it('archives without warnings when the product is not a style default material', async () => {
    const prisma = createPrisma({
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(validationRow())
          .mockResolvedValueOnce(
            createProductAdminRow({ status: PublicationStatus.ARCHIVED }),
          ),
      },
    });
    const service = new ProductsService(prisma, createImageUrls());

    const result = await service.changeStatus(
      PRODUCT_ID,
      { status: PublicationStatus.ARCHIVED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.warnings).toBeUndefined();
  });
});

describe('ProductsService.remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a product with no style default material references', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: PRODUCT_ID,
      styleDefaultMaterials: [],
    });
    const del = vi.fn().mockResolvedValue(undefined);
    const prisma = createPrisma({ product: { findUnique, delete: del } });
    const service = new ProductsService(prisma, createImageUrls());

    await service.remove(PRODUCT_ID);

    expect(del).toHaveBeenCalledWith({ where: { id: PRODUCT_ID } });
  });

  it('rejects deleting a product referenced by a style default material', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: PRODUCT_ID,
      styleDefaultMaterials: [
        {
          style: {
            id: STYLE_ID,
            name: localized('Scandinavian', 'Скандинавський'),
          },
        },
      ],
    });
    const prisma = createPrisma({ product: { findUnique } });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(service.remove(PRODUCT_ID)).rejects.toMatchObject({
      code: ERROR_CODES.PRODUCT_IN_USE,
      params: {
        styles: [
          { id: STYLE_ID, name: localized('Scandinavian', 'Скандинавський') },
        ],
      },
    });
  });

  it('rejects deleting an unknown product', async () => {
    const prisma = createPrisma({
      product: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new ProductsService(prisma, createImageUrls());

    await expect(service.remove(PRODUCT_ID)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});
