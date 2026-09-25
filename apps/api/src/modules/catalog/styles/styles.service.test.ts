import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { PublicationStatus } from '../../../generated/prisma/enums';
import type { ImageUrlBuilder } from '../images/image-urls';
import { StylesService } from './styles.service';

const STYLE_ID = 'style-1';
const ADMIN_ID = 'admin-1';
const REVISION = 'revision-1';
const NEXT_REVISION = 'revision-2';

function localized(en: string, uk: string) {
  return { en, uk };
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

function createStyleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STYLE_ID,
    name: localized('Scandi', 'Скандi'),
    description: localized('Light and airy', 'Легкий і повітряний'),
    imageId: null,
    image: null,
    sortOrder: 0,
    status: PublicationStatus.DRAFT,
    revision: REVISION,
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedById: ADMIN_ID,
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    ...overrides,
  };
}

function link(
  roomTypeId: string,
  categoryId: string,
  roomTypeCode: string,
  categoryName: { en: string; uk: string },
) {
  return {
    roomTypeId,
    categoryId,
    roomType: { code: roomTypeCode },
    category: { name: categoryName },
  };
}

function defaultEntry(
  roomTypeId: string,
  categoryId: string,
  product: {
    id: string;
    name: { en: string; uk: string };
    status: PublicationStatus;
    categoryId?: string;
  },
) {
  return {
    roomTypeId,
    categoryId,
    product: { categoryId, ...product },
  };
}

function createPrisma(overrides: Record<string, unknown> = {}) {
  const style = {
    findMany: vi.fn(),
    findUnique: vi.fn().mockResolvedValue(createStyleRow()),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    ...(overrides.style as Record<string, unknown> | undefined),
  };
  const roomTypeCategory = {
    findMany: vi.fn().mockResolvedValue([]),
    ...(overrides.roomTypeCategory as Record<string, unknown> | undefined),
  };
  const styleDefaultMaterial = {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({}),
    ...(overrides.styleDefaultMaterial as Record<string, unknown> | undefined),
  };
  const image = {
    findMany: vi.fn().mockResolvedValue([]),
    ...(overrides.image as Record<string, unknown> | undefined),
  };
  const product = {
    findMany: vi.fn().mockResolvedValue([]),
    ...(overrides.product as Record<string, unknown> | undefined),
  };

  const tx = { style, roomTypeCategory, styleDefaultMaterial, image, product };

  const $transaction = vi.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (client: typeof tx) => unknown)(tx);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  return {
    style,
    roomTypeCategory,
    styleDefaultMaterial,
    image,
    product,
    $transaction,
    tx,
  } as unknown as PrismaService & { tx: typeof tx };
}

describe('StylesService.get', () => {
  it('computes FILLED, EMPTY and PRODUCT_UNAVAILABLE pair states', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([
        link(
          'room-1',
          'category-1',
          'LIVING_ROOM',
          localized('Tiles', 'Плитка'),
        ),
        link(
          'room-1',
          'category-2',
          'LIVING_ROOM',
          localized('Paint', 'Фарба'),
        ),
        link('room-2', 'category-1', 'BEDROOM', localized('Tiles', 'Плитка')),
      ]);
    const styleDefaultMaterialFindMany = vi.fn().mockResolvedValue([
      defaultEntry('room-1', 'category-1', {
        id: 'product-1',
        name: localized('Oak', 'Дуб'),
        status: PublicationStatus.PUBLISHED,
      }),
      defaultEntry('room-2', 'category-1', {
        id: 'product-2',
        name: localized('Pine', 'Сосна'),
        status: PublicationStatus.DRAFT,
      }),
    ]);
    const prisma = createPrisma({
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      styleDefaultMaterial: { findMany: styleDefaultMaterialFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    const result = await service.get(STYLE_ID);

    expect(result.pairs).toEqual([
      expect.objectContaining({
        roomTypeId: 'room-1',
        categoryId: 'category-1',
        productId: 'product-1',
        state: 'FILLED',
      }),
      expect.objectContaining({
        roomTypeId: 'room-1',
        categoryId: 'category-2',
        productId: null,
        state: 'EMPTY',
      }),
      expect.objectContaining({
        roomTypeId: 'room-2',
        categoryId: 'category-1',
        productId: 'product-2',
        state: 'PRODUCT_UNAVAILABLE',
      }),
    ]);
    expect(result.unfilledCount).toBe(1);
    expect(result.unavailableCount).toBe(1);
  });

  it('marks a pair PRODUCT_UNAVAILABLE when the linked product moved to another category', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([
        link(
          'room-1',
          'category-1',
          'LIVING_ROOM',
          localized('Tiles', 'Плитка'),
        ),
      ]);
    const styleDefaultMaterialFindMany = vi.fn().mockResolvedValue([
      defaultEntry('room-1', 'category-1', {
        id: 'product-1',
        name: localized('Oak', 'Дуб'),
        status: PublicationStatus.PUBLISHED,
        categoryId: 'category-2',
      }),
    ]);
    const prisma = createPrisma({
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      styleDefaultMaterial: { findMany: styleDefaultMaterialFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    const result = await service.get(STYLE_ID);

    expect(result.pairs).toEqual([
      expect.objectContaining({
        roomTypeId: 'room-1',
        categoryId: 'category-1',
        productId: 'product-1',
        state: 'PRODUCT_UNAVAILABLE',
      }),
    ]);
    expect(result.unavailableCount).toBe(1);
  });

  it('rejects an unknown style', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrisma({ style: { findUnique } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(service.get(STYLE_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('StylesService.list', () => {
  it('loads room-type links and default materials once for every style, not per style', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([
        link(
          'room-1',
          'category-1',
          'LIVING_ROOM',
          localized('Tiles', 'Плитка'),
        ),
      ]);
    const styleDefaultMaterialFindMany = vi.fn().mockResolvedValue([]);
    const styleFindMany = vi
      .fn()
      .mockResolvedValue([
        createStyleRow({ id: 'style-1' }),
        createStyleRow({ id: 'style-2' }),
      ]);
    const prisma = createPrisma({
      style: { findMany: styleFindMany },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      styleDefaultMaterial: { findMany: styleDefaultMaterialFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    const result = await service.list();

    expect(result.items).toHaveLength(2);
    expect(roomTypeCategoryFindMany).toHaveBeenCalledTimes(1);
    expect(styleDefaultMaterialFindMany).toHaveBeenCalledTimes(1);
    expect(styleDefaultMaterialFindMany.mock.calls[0][0]).not.toHaveProperty(
      'where',
    );
  });
});

describe('StylesService.create', () => {
  it('creates a draft style with the next sort order', async () => {
    const aggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: 2 } });
    const create = vi.fn().mockResolvedValue(createStyleRow());
    const prisma = createPrisma({ style: { aggregate, create } });
    const service = new StylesService(prisma, createImageUrls());

    await service.create(
      { name: localized('', ''), description: localized('', '') },
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublicationStatus.DRAFT,
          sortOrder: 3,
          updatedById: ADMIN_ID,
        }),
      }),
    );
  });

  it('rejects an unknown image id', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({ image: { findMany } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.create(
        {
          name: localized('', ''),
          description: localized('', ''),
          imageId: 'missing-image',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
      params: { imageIds: ['missing-image'] },
    });
  });
});

describe('StylesService.update', () => {
  it('rejects a stale revision with the current one', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue({ revision: NEXT_REVISION });
    const prisma = createPrisma({ style: { updateMany, findUnique } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.update(STYLE_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: 'STALE_REVISION',
      params: { currentRevision: NEXT_REVISION },
    });
  });

  it('clears the image when imageId is null', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue(createStyleRow());
    const prisma = createPrisma({ style: { updateMany, findUnique } });
    const service = new StylesService(prisma, createImageUrls());

    await service.update(
      STYLE_ID,
      { imageId: null, revision: REVISION },
      ADMIN_ID,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageId: null }),
      }),
    );
  });

  it('rejects clearing the image on a published style with STYLE_IMAGE_MISSING', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createStyleRow({
        status: PublicationStatus.PUBLISHED,
        imageId: 'image-1',
      }),
    );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ style: { findUnique, updateMany } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.update(STYLE_ID, { imageId: null, revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({ code: 'STYLE_IMAGE_MISSING' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects patching a published style into a missing translation', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createStyleRow({
        status: PublicationStatus.PUBLISHED,
        imageId: 'image-1',
      }),
    );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ style: { findUnique, updateMany } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.update(
        STYLE_ID,
        { name: localized('Scandi', ''), revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'TRANSLATION_MISSING' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('allows patching a published style when the merged result stays publishable', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createStyleRow({
        status: PublicationStatus.PUBLISHED,
        imageId: 'image-1',
      }),
    );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ style: { findUnique, updateMany } });
    const service = new StylesService(prisma, createImageUrls());

    await service.update(
      STYLE_ID,
      { description: localized('New', 'Новий'), revision: REVISION },
      ADMIN_ID,
    );

    expect(updateMany).toHaveBeenCalled();
  });
});

describe('StylesService.reorder', () => {
  it('rejects a set missing an existing style', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'style-1' }, { id: 'style-2' }]);
    const prisma = createPrisma({ style: { findMany } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.reorder({ styleIds: ['style-1'] }, ADMIN_ID),
    ).rejects.toMatchObject({ code: 'STYLE_SET_MISMATCH' });
  });

  it('rejects a set with a duplicated style id', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'style-1' }, { id: 'style-2' }]);
    const prisma = createPrisma({ style: { findMany } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.reorder({ styleIds: ['style-1', 'style-1'] }, ADMIN_ID),
    ).rejects.toMatchObject({ code: 'STYLE_SET_MISMATCH' });
  });

  it('reorders every style matching the full existing set', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'style-1' }, { id: 'style-2' }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({ style: { findMany, update } });
    const service = new StylesService(prisma, createImageUrls());

    await service.reorder({ styleIds: ['style-2', 'style-1'] }, ADMIN_ID);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'style-2' },
        data: expect.objectContaining({ sortOrder: 0 }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'style-1' },
        data: expect.objectContaining({ sortOrder: 1 }),
      }),
    );
  });

  it('does not write a new revision, keeping revisions read before reorder valid', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'style-1' }, { id: 'style-2' }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({ style: { findMany, update } });
    const service = new StylesService(prisma, createImageUrls());

    await service.reorder({ styleIds: ['style-2', 'style-1'] }, ADMIN_ID);

    for (const call of update.mock.calls) {
      expect(call[0].data).not.toHaveProperty('revision');
    }
  });

  it('reports STYLE_SET_MISMATCH instead of a raw error when a style vanishes mid-transaction', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'style-1' }, { id: 'style-2' }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({ style: { findMany, update } });
    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    prisma.$transaction = vi.fn().mockRejectedValue(p2025);
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.reorder({ styleIds: ['style-2', 'style-1'] }, ADMIN_ID),
    ).rejects.toMatchObject({ code: 'STYLE_SET_MISMATCH' });
  });
});

describe('StylesService.updateStatus', () => {
  it('rejects publishing when a translation is missing', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({
      name: localized('Scandi', ''),
      description: localized('Light', 'Легкий'),
      imageId: 'image-1',
    });
    const prisma = createPrisma({ style: { findUnique } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.updateStatus(
        STYLE_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'TRANSLATION_MISSING',
      params: { fields: ['name.uk'] },
    });
  });

  it('rejects publishing without an image', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({
      name: localized('Scandi', 'Скандi'),
      description: localized('Light', 'Легкий'),
      imageId: null,
    });
    const prisma = createPrisma({ style: { findUnique } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.updateStatus(
        STYLE_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'STYLE_IMAGE_MISSING' });
  });

  it('publishes when translations and the image are present', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({
        name: localized('Scandi', 'Скандi'),
        description: localized('Light', 'Легкий'),
        imageId: 'image-1',
      })
      .mockResolvedValueOnce(
        createStyleRow({ status: PublicationStatus.PUBLISHED }),
      );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ style: { findUnique, updateMany } });
    const service = new StylesService(prisma, createImageUrls());

    const result = await service.updateStatus(
      STYLE_ID,
      { status: PublicationStatus.PUBLISHED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.status).toBe(PublicationStatus.PUBLISHED);
  });
});

describe('StylesService.updateDefaultMaterials', () => {
  it('rejects a pair that is not in the room type when a product is set', async () => {
    const roomTypeCategoryFindMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.updateDefaultMaterials(
        STYLE_ID,
        {
          items: [
            {
              roomTypeId: 'room-1',
              categoryId: 'category-1',
              productId: 'product-1',
            },
          ],
          revision: REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'PAIR_NOT_IN_ROOM_TYPE' });
  });

  it('rejects a product from a different category', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([{ roomTypeId: 'room-1', categoryId: 'category-1' }]);
    const productFindMany = vi
      .fn()
      .mockResolvedValue([{ id: 'product-1', categoryId: 'category-2' }]);
    const prisma = createPrisma({
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      product: { findMany: productFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.updateDefaultMaterials(
        STYLE_ID,
        {
          items: [
            {
              roomTypeId: 'room-1',
              categoryId: 'category-1',
              productId: 'product-1',
            },
          ],
          revision: REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_CATEGORY_MISMATCH' });
  });

  it('rejects a product that no longer exists', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([{ roomTypeId: 'room-1', categoryId: 'category-1' }]);
    const productFindMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      product: { findMany: productFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.updateDefaultMaterials(
        STYLE_ID,
        {
          items: [
            {
              roomTypeId: 'room-1',
              categoryId: 'category-1',
              productId: 'missing-product',
            },
          ],
          revision: REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      params: { productIds: ['missing-product'] },
    });
  });

  it('allows clearing an orphan row with productId null even when the pair is no longer in the room type', async () => {
    const roomTypeCategoryFindMany = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({
      style: { updateMany },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      styleDefaultMaterial: { deleteMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    await service.updateDefaultMaterials(
      STYLE_ID,
      {
        items: [
          { roomTypeId: 'room-1', categoryId: 'category-1', productId: null },
        ],
        revision: REVISION,
      },
      ADMIN_ID,
    );

    for (const call of roomTypeCategoryFindMany.mock.calls) {
      expect(call[0]).not.toHaveProperty('where');
    }
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        styleId: STYLE_ID,
        roomTypeId: 'room-1',
        categoryId: 'category-1',
      },
    });
  });

  it('deletes the pair when productId is null', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([
        link(
          'room-1',
          'category-1',
          'LIVING_ROOM',
          localized('Tiles', 'Плитка'),
        ),
      ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({
      style: { updateMany },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      styleDefaultMaterial: { deleteMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    await service.updateDefaultMaterials(
      STYLE_ID,
      {
        items: [
          { roomTypeId: 'room-1', categoryId: 'category-1', productId: null },
        ],
        revision: REVISION,
      },
      ADMIN_ID,
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        styleId: STYLE_ID,
        roomTypeId: 'room-1',
        categoryId: 'category-1',
      },
    });
  });

  it('upserts the pair when productId is set', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([
        link(
          'room-1',
          'category-1',
          'LIVING_ROOM',
          localized('Tiles', 'Плитка'),
        ),
      ]);
    const productFindMany = vi
      .fn()
      .mockResolvedValue([{ id: 'product-1', categoryId: 'category-1' }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({
      style: { updateMany },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      product: { findMany: productFindMany },
      styleDefaultMaterial: { upsert },
    });
    const service = new StylesService(prisma, createImageUrls());

    await service.updateDefaultMaterials(
      STYLE_ID,
      {
        items: [
          {
            roomTypeId: 'room-1',
            categoryId: 'category-1',
            productId: 'product-1',
          },
        ],
        revision: REVISION,
      },
      ADMIN_ID,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          styleId_roomTypeId_categoryId: {
            styleId: STYLE_ID,
            roomTypeId: 'room-1',
            categoryId: 'category-1',
          },
        },
        update: { productId: 'product-1' },
      }),
    );
  });

  it('rejects a stale revision with the current one', async () => {
    const roomTypeCategoryFindMany = vi
      .fn()
      .mockResolvedValue([{ roomTypeId: 'room-1', categoryId: 'category-1' }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue({ revision: NEXT_REVISION });
    const prisma = createPrisma({
      style: { updateMany, findUnique },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
    });
    const service = new StylesService(prisma, createImageUrls());

    await expect(
      service.updateDefaultMaterials(
        STYLE_ID,
        {
          items: [
            { roomTypeId: 'room-1', categoryId: 'category-1', productId: null },
          ],
          revision: REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'STALE_REVISION',
      params: { currentRevision: NEXT_REVISION },
    });
  });
});

describe('StylesService.remove', () => {
  it('deletes an existing style', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ style: { deleteMany } });
    const service = new StylesService(prisma, createImageUrls());

    await service.remove(STYLE_ID);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: STYLE_ID } });
  });

  it('rejects deleting an unknown style', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = createPrisma({ style: { deleteMany } });
    const service = new StylesService(prisma, createImageUrls());

    await expect(service.remove(STYLE_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects deleting the same style twice', async () => {
    const deleteMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const prisma = createPrisma({ style: { deleteMany } });
    const service = new StylesService(prisma, createImageUrls());

    await service.remove(STYLE_ID);

    await expect(service.remove(STYLE_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
