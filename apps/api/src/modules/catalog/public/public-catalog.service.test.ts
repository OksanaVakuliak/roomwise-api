import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  OptionKind,
  OptionUnit,
  ProductUnit,
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import type { ImageUrlBuilder } from '../images/image-urls';
import { PublicCatalogService } from './public-catalog.service';

function localized(en: string, uk: string) {
  return { en, uk };
}

function createImageUrlBuilder(): ImageUrlBuilder {
  return {
    toImageRef: vi.fn(({ id, publicId }: { id: string; publicId: string }) => ({
      id,
      thumb: `thumb/${publicId}`,
      card: `card/${publicId}`,
      zoom: `zoom/${publicId}`,
    })),
    toTextureRef: vi.fn(
      ({ id, publicId }: { id: string; publicId: string }) => ({
        id,
        url: `texture/${publicId}`,
      }),
    ),
  } as unknown as ImageUrlBuilder;
}

function createPrisma(overrides: Record<string, unknown>): PrismaService {
  return overrides as unknown as PrismaService;
}

describe('PublicCatalogService.listStyles', () => {
  it('returns published styles ordered by sortOrder, localized, with image or null', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'style-1',
        name: localized('Scandinavian', 'Скандинавський'),
        description: localized('Light', 'Світлий'),
        image: { id: 'image-1', publicId: 'roomwise/seed/style-1' },
      },
      {
        id: 'style-2',
        name: localized('Modern', 'Сучасний'),
        description: localized('Clean', 'Чистий'),
        image: null,
      },
    ]);
    const prisma = createPrisma({ style: { findMany } });
    const imageUrlBuilder = createImageUrlBuilder();
    const service = new PublicCatalogService(prisma, imageUrlBuilder);

    const result = await service.listStyles('uk');

    expect(findMany).toHaveBeenCalledWith({
      where: { status: PublicationStatus.PUBLISHED },
      orderBy: { sortOrder: 'asc' },
      include: { image: true },
    });
    expect(result).toEqual({
      items: [
        {
          id: 'style-1',
          name: 'Скандинавський',
          description: 'Світлий',
          image: {
            id: 'image-1',
            thumb: 'thumb/roomwise/seed/style-1',
            card: 'card/roomwise/seed/style-1',
            zoom: 'zoom/roomwise/seed/style-1',
          },
        },
        {
          id: 'style-2',
          name: 'Сучасний',
          description: 'Чистий',
          image: null,
        },
      ],
    });
  });

  it('falls back to English text when lang is en', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'style-1',
        name: localized('Scandinavian', 'Скандинавський'),
        description: localized('Light', 'Світлий'),
        image: null,
      },
    ]);
    const prisma = createPrisma({ style: { findMany } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.listStyles('en');

    expect(result.items[0].name).toBe('Scandinavian');
  });
});

describe('PublicCatalogService.listRoomTypes', () => {
  it('groups published categories under each room type, ordered, with productCount 0 when uncounted', async () => {
    const roomTypeFindMany = vi.fn().mockResolvedValue([
      {
        id: 'rt-living',
        code: RoomTypeCode.LIVING_ROOM,
        name: localized('Living Room', 'Вітальня'),
      },
      {
        id: 'rt-bedroom',
        code: RoomTypeCode.BEDROOM,
        name: localized('Bedroom', 'Спальня'),
      },
    ]);
    const roomTypeCategoryFindMany = vi.fn().mockResolvedValue([
      {
        roomTypeId: 'rt-living',
        category: {
          id: 'cat-flooring',
          name: localized('Flooring', 'Підлога'),
          surface: SurfaceKind.FLOOR,
          wastePercent: { toNumber: () => 10 },
        },
      },
      {
        roomTypeId: 'rt-living',
        category: {
          id: 'cat-walls',
          name: localized('Walls', 'Стіни'),
          surface: SurfaceKind.WALLS,
          wastePercent: { toNumber: () => 7 },
        },
      },
    ]);
    const groupBy = vi
      .fn()
      .mockResolvedValue([{ categoryId: 'cat-flooring', _count: { _all: 3 } }]);
    const prisma = createPrisma({
      roomType: { findMany: roomTypeFindMany },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      product: { groupBy },
    });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.listRoomTypes('en');

    expect(roomTypeCategoryFindMany).toHaveBeenCalledWith({
      where: { category: { status: PublicationStatus.PUBLISHED } },
      orderBy: { sortOrder: 'asc' },
      include: { category: true },
    });
    expect(result.items).toHaveLength(2);
    const living = result.items.find(
      (item) => item.code === RoomTypeCode.LIVING_ROOM,
    );
    expect(living?.categories).toEqual([
      {
        id: 'cat-flooring',
        name: 'Flooring',
        surface: 'FLOOR',
        wastePercent: 10,
        productCount: 3,
      },
      {
        id: 'cat-walls',
        name: 'Walls',
        surface: 'WALLS',
        wastePercent: 7,
        productCount: 0,
      },
    ]);
    const bedroom = result.items.find(
      (item) => item.code === RoomTypeCode.BEDROOM,
    );
    expect(bedroom?.categories).toEqual([]);
  });
});

describe('PublicCatalogService.listCategoryProducts', () => {
  it('throws NOT_FOUND when the category does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrisma({ category: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await expect(
      service.listCategoryProducts('missing', 'en'),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('throws NOT_FOUND when the category is not published', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ status: PublicationStatus.DRAFT });
    const prisma = createPrisma({ category: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await expect(
      service.listCategoryProducts('draft-cat', 'en'),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns showcase cards sorted by name with the primary image or null', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ status: PublicationStatus.PUBLISHED });
    const productFindMany = vi.fn().mockResolvedValue([
      {
        id: 'product-a',
        name: localized('Oak Laminate', 'Дубовий ламінат'),
        brand: 'Floorwise',
        manufacturer: 'Floorwise Manufacturing',
        size: localized('1380 x 193 mm', '1380 x 193 мм'),
        color: localized('Natural Oak', 'Натуральний дуб'),
        priceCents: 1800,
        unit: ProductUnit.SQM,
        heatedFloorCompatible: true,
        materialType: { code: 'laminate' },
        images: [{ image: { id: 'image-1', publicId: 'roomwise/seed/a' } }],
      },
      {
        id: 'product-b',
        name: localized('Lamp', 'Лампа'),
        brand: 'Lumina',
        manufacturer: 'Lumina Lighting',
        size: localized('30 cm', '30 см'),
        color: localized('Black', 'Чорний'),
        priceCents: 4500,
        unit: ProductUnit.PIECE,
        heatedFloorCompatible: false,
        materialType: { code: 'lighting' },
        images: [],
      },
    ]);
    const prisma = createPrisma({
      category: { findUnique },
      product: { findMany: productFindMany },
    });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.listCategoryProducts('cat-flooring', 'en');

    expect(productFindMany).toHaveBeenCalledWith({
      where: {
        categoryId: 'cat-flooring',
        status: PublicationStatus.PUBLISHED,
      },
      include: {
        materialType: { select: { code: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          include: { image: true },
        },
      },
    });
    expect(result.items.map((item) => item.id)).toEqual([
      'product-b',
      'product-a',
    ]);
    expect(result.items[0].image).toBeNull();
    expect(result.items[1].image).toEqual({
      id: 'image-1',
      thumb: 'thumb/roomwise/seed/a',
      card: 'card/roomwise/seed/a',
      zoom: 'zoom/roomwise/seed/a',
    });
  });

  it('breaks name ties by id for deterministic ordering', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ status: PublicationStatus.PUBLISHED });
    const productFindMany = vi.fn().mockResolvedValue([
      {
        id: 'product-b',
        name: localized('Tile', 'Плитка'),
        brand: 'Floorwise',
        manufacturer: 'Floorwise Manufacturing',
        size: localized('600 x 600 mm', '600 x 600 мм'),
        color: localized('White', 'Білий'),
        priceCents: 1000,
        unit: ProductUnit.SQM,
        heatedFloorCompatible: false,
        materialType: { code: 'tile' },
        images: [],
      },
      {
        id: 'product-a',
        name: localized('Tile', 'Плитка'),
        brand: 'Floorwise',
        manufacturer: 'Floorwise Manufacturing',
        size: localized('600 x 600 mm', '600 x 600 мм'),
        color: localized('White', 'Білий'),
        priceCents: 1000,
        unit: ProductUnit.SQM,
        heatedFloorCompatible: false,
        materialType: { code: 'tile' },
        images: [],
      },
    ]);
    const prisma = createPrisma({
      category: { findUnique },
      product: { findMany: productFindMany },
    });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.listCategoryProducts('cat-flooring', 'en');

    expect(result.items.map((item) => item.id)).toEqual([
      'product-a',
      'product-b',
    ]);
  });
});

describe('PublicCatalogService.getProduct', () => {
  function baseProduct(overrides: Record<string, unknown> = {}) {
    return {
      id: 'product-a',
      categoryId: 'cat-flooring',
      name: localized('Oak Laminate', 'Дубовий ламінат'),
      description: localized('Durable', 'Міцний'),
      brand: 'Floorwise',
      manufacturer: 'Floorwise Manufacturing',
      size: localized('1380 x 193 mm', '1380 x 193 мм'),
      color: localized('Natural Oak', 'Натуральний дуб'),
      priceCents: 1800,
      unit: ProductUnit.SQM,
      heatedFloorCompatible: true,
      materialType: { code: 'laminate' },
      status: PublicationStatus.PUBLISHED,
      wastePercentOverride: null,
      category: {
        status: PublicationStatus.PUBLISHED,
        surface: SurfaceKind.FLOOR,
        wastePercent: { toNumber: () => 10 },
      },
      textureImage: { id: 'texture-1', publicId: 'roomwise/seed/texture' },
      tileWidthMm: 193,
      tileLengthMm: 1380,
      fallbackColor: '#B08D62',
      images: [],
      attributes: [],
      ...overrides,
    };
  }

  it('throws NOT_FOUND when the product does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await expect(service.getProduct('missing', 'en')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it.each([PublicationStatus.DRAFT, PublicationStatus.ARCHIVED])(
    'throws PRODUCT_UNAVAILABLE when the product status is %s',
    async (status) => {
      const findUnique = vi.fn().mockResolvedValue(baseProduct({ status }));
      const prisma = createPrisma({ product: { findUnique } });
      const service = new PublicCatalogService(prisma, createImageUrlBuilder());

      await expect(service.getProduct('product-a', 'en')).rejects.toMatchObject(
        { code: ERROR_CODES.PRODUCT_UNAVAILABLE },
      );
    },
  );

  it('throws PRODUCT_UNAVAILABLE when the product is published but its category is not', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      baseProduct({
        category: {
          status: PublicationStatus.DRAFT,
          surface: SurfaceKind.FLOOR,
          wastePercent: { toNumber: () => 10 },
        },
      }),
    );
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await expect(service.getProduct('product-a', 'en')).rejects.toMatchObject({
      code: ERROR_CODES.PRODUCT_UNAVAILABLE,
    });
  });

  it('queries the product with images ordered primary-first, then by sortOrder', async () => {
    const findUnique = vi.fn().mockResolvedValue(baseProduct());
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await service.getProduct('product-a', 'en');

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'product-a' },
      include: {
        category: true,
        materialType: { select: { code: true } },
        textureImage: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          include: { image: true },
        },
        attributes: { orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  it('uses the category waste percent when no override is set', async () => {
    const findUnique = vi.fn().mockResolvedValue(baseProduct());
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getProduct('product-a', 'en');

    expect(result.wastePercent).toBe(10);
  });

  it('uses the product waste percent override when set', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(
        baseProduct({ wastePercentOverride: { toNumber: () => 15 } }),
      );
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getProduct('product-a', 'en');

    expect(result.wastePercent).toBe(15);
  });

  it('returns surface: null when the category is not a surface', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      baseProduct({
        category: {
          status: PublicationStatus.PUBLISHED,
          surface: SurfaceKind.NONE,
          wastePercent: { toNumber: () => 5 },
        },
      }),
    );
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getProduct('product-a', 'en');

    expect(result.surface).toBeNull();
  });

  it('returns surface: null when required surface data is missing despite a surface category', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(baseProduct({ fallbackColor: null }));
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getProduct('product-a', 'en');

    expect(result.surface).toBeNull();
  });

  it('returns full surface data for a surface product', async () => {
    const findUnique = vi.fn().mockResolvedValue(baseProduct());
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getProduct('product-a', 'en');

    expect(result.surface).toEqual({
      kind: 'FLOOR',
      texture: {
        id: 'texture-1',
        url: 'texture/roomwise/seed/texture',
      },
      tileWidthMm: 193,
      tileLengthMm: 1380,
      fallbackColor: '#B08D62',
    });
  });

  it('orders images and localizes attributes', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      baseProduct({
        images: [
          { image: { id: 'image-1', publicId: 'roomwise/seed/a-1' } },
          { image: { id: 'image-2', publicId: 'roomwise/seed/a-2' } },
        ],
        attributes: [
          {
            name: localized('Thickness', 'Товщина'),
            value: localized('8 mm', '8 мм'),
          },
        ],
      }),
    );
    const prisma = createPrisma({ product: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getProduct('product-a', 'uk');

    expect(result.images).toEqual([
      {
        id: 'image-1',
        thumb: 'thumb/roomwise/seed/a-1',
        card: 'card/roomwise/seed/a-1',
        zoom: 'zoom/roomwise/seed/a-1',
      },
      {
        id: 'image-2',
        thumb: 'thumb/roomwise/seed/a-2',
        card: 'card/roomwise/seed/a-2',
        zoom: 'zoom/roomwise/seed/a-2',
      },
    ]);
    expect(result.attributes).toEqual([{ name: 'Товщина', value: '8 мм' }]);
  });
});

describe('PublicCatalogService.getStyleDefaultMaterials', () => {
  it('throws NOT_FOUND when the style does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrisma({ style: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await expect(
      service.getStyleDefaultMaterials('missing'),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('throws NOT_FOUND when the style is not published', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ status: PublicationStatus.DRAFT });
    const prisma = createPrisma({ style: { findUnique } });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    await expect(
      service.getStyleDefaultMaterials('draft-style'),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns every published-category pair, nulling unfilled or unavailable ones', async () => {
    const styleFindUnique = vi
      .fn()
      .mockResolvedValue({ status: PublicationStatus.PUBLISHED });
    const roomTypeCategoryFindMany = vi.fn().mockResolvedValue([
      {
        roomTypeId: 'rt-living',
        categoryId: 'cat-flooring',
        roomType: { code: RoomTypeCode.LIVING_ROOM },
      },
      {
        roomTypeId: 'rt-bedroom',
        categoryId: 'cat-flooring',
        roomType: { code: RoomTypeCode.BEDROOM },
      },
      {
        roomTypeId: 'rt-bathroom',
        categoryId: 'cat-flooring',
        roomType: { code: RoomTypeCode.BATHROOM },
      },
    ]);
    const styleDefaultMaterialFindMany = vi.fn().mockResolvedValue([
      {
        roomTypeId: 'rt-living',
        categoryId: 'cat-flooring',
        product: { id: 'product-a', status: PublicationStatus.PUBLISHED },
      },
      {
        roomTypeId: 'rt-bathroom',
        categoryId: 'cat-flooring',
        product: { id: 'product-archived', status: PublicationStatus.ARCHIVED },
      },
    ]);
    const prisma = createPrisma({
      style: { findUnique: styleFindUnique },
      roomTypeCategory: { findMany: roomTypeCategoryFindMany },
      styleDefaultMaterial: { findMany: styleDefaultMaterialFindMany },
    });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getStyleDefaultMaterials('style-1');

    expect(result).toEqual({
      styleId: 'style-1',
      items: [
        {
          roomTypeCode: RoomTypeCode.LIVING_ROOM,
          categoryId: 'cat-flooring',
          productId: 'product-a',
        },
        {
          roomTypeCode: RoomTypeCode.BEDROOM,
          categoryId: 'cat-flooring',
          productId: null,
        },
        {
          roomTypeCode: RoomTypeCode.BATHROOM,
          categoryId: 'cat-flooring',
          productId: null,
        },
      ],
    });
  });
});

describe('PublicCatalogService.getEngineering', () => {
  it('maps package items and derives perRoom and roomTypeCodes for options', async () => {
    const packageItemFindMany = vi.fn().mockResolvedValue([
      {
        id: 'item-included',
        name: localized('Demolition', 'Демонтаж'),
        description: localized('Removing old finishes', 'Демонтаж старого'),
        includedInBase: true,
        priceCents: null,
        unit: null,
      },
    ]);
    const optionFindMany = vi.fn().mockResolvedValue([
      {
        id: 'option-room-sqm',
        kind: OptionKind.ENGINEERING,
        name: localized('Heated Floor', 'Тепла підлога'),
        description: localized('Underfloor heating', 'Тепла підлога опис'),
        image: null,
        priceCents: 3500,
        unit: OptionUnit.ROOM_SQM,
        minQuantity: null,
        maxQuantity: null,
        optionRoomTypes: [
          { roomType: { code: RoomTypeCode.BATHROOM } },
          { roomType: { code: RoomTypeCode.KITCHEN } },
        ],
      },
      {
        id: 'option-room-all',
        kind: OptionKind.ENGINEERING,
        name: localized('Smart Home', 'Розумний дім'),
        description: localized('Wiring', 'Проводка'),
        image: null,
        priceCents: 2000,
        unit: OptionUnit.ROOM,
        minQuantity: null,
        maxQuantity: null,
        optionRoomTypes: [],
      },
      {
        id: 'option-piece',
        kind: OptionKind.ENGINEERING,
        name: localized('Extra Socket', 'Додаткова розетка'),
        description: localized('Socket', 'Розетка'),
        image: null,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
        minQuantity: 1,
        maxQuantity: 3,
        optionRoomTypes: [],
      },
      {
        id: 'option-additional',
        kind: OptionKind.ADDITIONAL,
        name: localized('Cleaning', 'Прибирання'),
        description: localized('Cleaning after', 'Прибирання після'),
        image: null,
        priceCents: 4000,
        unit: OptionUnit.PROJECT,
        minQuantity: null,
        maxQuantity: null,
        optionRoomTypes: [],
      },
    ]);
    const prisma = createPrisma({
      engineeringPackageItem: { findMany: packageItemFindMany },
      option: { findMany: optionFindMany },
    });
    const service = new PublicCatalogService(prisma, createImageUrlBuilder());

    const result = await service.getEngineering('en');

    expect(optionFindMany).toHaveBeenCalledWith({
      where: { status: PublicationStatus.PUBLISHED },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
      include: {
        image: true,
        optionRoomTypes: {
          orderBy: { roomType: { sortOrder: 'asc' } },
          include: { roomType: { select: { code: true } } },
        },
      },
    });

    expect(result.packageItems).toEqual([
      {
        id: 'item-included',
        name: 'Demolition',
        description: 'Removing old finishes',
        includedInBase: true,
        priceCents: null,
        unit: null,
      },
    ]);

    const roomSqm = result.options.find(
      (option) => option.id === 'option-room-sqm',
    );
    expect(roomSqm?.perRoom).toBe(true);
    expect(roomSqm?.roomTypeCodes).toEqual([
      RoomTypeCode.BATHROOM,
      RoomTypeCode.KITCHEN,
    ]);

    const roomAll = result.options.find(
      (option) => option.id === 'option-room-all',
    );
    expect(roomAll?.perRoom).toBe(true);
    expect(roomAll?.roomTypeCodes).toEqual([]);

    const piece = result.options.find((option) => option.id === 'option-piece');
    expect(piece?.perRoom).toBe(false);
    expect(piece?.minQuantity).toBe(1);
    expect(piece?.maxQuantity).toBe(3);

    const additional = result.options.find(
      (option) => option.id === 'option-additional',
    );
    expect(additional?.kind).toBe(OptionKind.ADDITIONAL);
    expect(additional?.perRoom).toBe(false);
  });
});
