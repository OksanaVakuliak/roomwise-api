import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { AppConfigService } from '../../src/config/env';
import {
  OptionKind,
  OptionUnit,
  ProductUnit,
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../src/generated/prisma/client';
import type { CatalogDataset } from '../../src/modules/catalog/dataset/catalog-dataset.schema';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { createTestApp, type TestApp } from './app-factory';

const SEED_TIMEOUT_MS = 120_000;
const MIN_CATEGORY_COUNT = 8;
const MAX_CATEGORY_COUNT = 12;
const MIN_PRODUCTS_PER_CATEGORY = 6;
const MAX_PRODUCTS_PER_CATEGORY = 8;
const ROOM_TYPE_COUNT = 5;
const STYLE_COUNT = 3;
const ENGINEERING_ITEM_COUNT = 4;
const ENGINEERING_OPTION_COUNT = 5;
const MIN_ADDITIONAL_OPTION_COUNT = 2;
const MIN_CATEGORIES_WITH_PRODUCTS_PER_ROOM_TYPE = 4;
const HEATED_FLOOR_ROOM_TYPES = [
  RoomTypeCode.BATHROOM,
  RoomTypeCode.KITCHEN,
  RoomTypeCode.KITCHEN_LIVING,
].sort();

const dataset: CatalogDataset = catalogDataset;

interface PublicCategorySummary {
  id: string;
  name: string;
  productCount: number;
}

interface PublicRoomTypeSummary {
  code: string;
  name: string;
  categories: PublicCategorySummary[];
}

interface PublicNamedItem {
  name: string;
}

interface DefaultMaterialPair {
  roomTypeCode: string;
  categoryId: string;
  productId: string | null;
}

interface CatalogSnapshot {
  images: string[];
  roomTypes: string[];
  roomTypeCategories: string[];
  materialTypes: string[];
  categories: string[];
  products: string[];
  productImages: string[];
  productAttributes: string[];
  styles: string[];
  styleDefaultMaterials: string[];
  engineeringPackageItems: string[];
  options: string[];
  optionRoomTypes: string[];
}

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

async function applySeed(testApp: TestApp): Promise<void> {
  const service = testApp.app.get(CatalogDatasetService);
  await testApp.prisma.$transaction((tx) => service.upsert(dataset, tx), {
    timeout: SEED_TIMEOUT_MS,
    maxWait: 30_000,
  });
}

async function snapshotCatalogTables(
  prisma: PrismaService,
): Promise<CatalogSnapshot> {
  const [
    images,
    roomTypes,
    roomTypeCategories,
    materialTypes,
    categories,
    products,
    productImages,
    productAttributes,
    styles,
    styleDefaultMaterials,
    engineeringPackageItems,
    options,
    optionRoomTypes,
  ] = await Promise.all([
    prisma.image.findMany({ select: { id: true } }),
    prisma.roomType.findMany({ select: { id: true } }),
    prisma.roomTypeCategory.findMany({
      select: { roomTypeId: true, categoryId: true },
    }),
    prisma.materialType.findMany({ select: { id: true } }),
    prisma.category.findMany({ select: { id: true } }),
    prisma.product.findMany({ select: { id: true } }),
    prisma.productImage.findMany({
      select: { productId: true, imageId: true },
    }),
    prisma.productAttribute.findMany({ select: { id: true } }),
    prisma.style.findMany({ select: { id: true } }),
    prisma.styleDefaultMaterial.findMany({
      select: { styleId: true, roomTypeId: true, categoryId: true },
    }),
    prisma.engineeringPackageItem.findMany({ select: { id: true } }),
    prisma.option.findMany({ select: { id: true } }),
    prisma.optionRoomType.findMany({
      select: { optionId: true, roomTypeId: true },
    }),
  ]);

  return {
    images: images.map((row) => row.id).sort(),
    roomTypes: roomTypes.map((row) => row.id).sort(),
    roomTypeCategories: roomTypeCategories
      .map((row) => `${row.roomTypeId}:${row.categoryId}`)
      .sort(),
    materialTypes: materialTypes.map((row) => row.id).sort(),
    categories: categories.map((row) => row.id).sort(),
    products: products.map((row) => row.id).sort(),
    productImages: productImages
      .map((row) => `${row.productId}:${row.imageId}`)
      .sort(),
    productAttributes: productAttributes.map((row) => row.id).sort(),
    styles: styles.map((row) => row.id).sort(),
    styleDefaultMaterials: styleDefaultMaterials
      .map((row) => `${row.styleId}:${row.roomTypeId}:${row.categoryId}`)
      .sort(),
    engineeringPackageItems: engineeringPackageItems
      .map((row) => row.id)
      .sort(),
    options: options.map((row) => row.id).sort(),
    optionRoomTypes: optionRoomTypes
      .map((row) => `${row.optionId}:${row.roomTypeId}`)
      .sort(),
  };
}

async function findFullyFilledStyleId(
  prisma: PrismaService,
  totalPairs: number,
): Promise<string> {
  const styles = await prisma.style.findMany({
    select: { id: true, _count: { select: { styleDefaultMaterials: true } } },
  });

  const fullyFilled = styles.find(
    (style) => style._count.styleDefaultMaterials === totalPairs,
  );

  if (fullyFilled) {
    return fullyFilled.id;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM styles WHERE name ->> 'en' ILIKE '%Scandinavian%' LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error(
      'Could not locate the fully filled Scandinavian style among the seeded styles',
    );
  }

  return rows[0].id;
}

function assertLocalizedText(value: unknown, label: string): void {
  const text = value as { en?: string; uk?: string };
  expect(text.en?.trim(), `${label}.en`).not.toBe('');
  expect(text.uk?.trim(), `${label}.uk`).not.toBe('');
}

function assertNonEmptyNames(items: PublicNamedItem[]): void {
  for (const item of items) {
    expect(item.name.trim()).not.toBe('');
  }
}

function createUnreachablePrismaService(): PrismaService {
  const config = {
    get: (key: string) =>
      key === 'DATABASE_URL'
        ? 'postgresql://roomwise:roomwise@127.0.0.1:1/roomwise_seed_test'
        : undefined,
  } as unknown as AppConfigService;

  return new PrismaService(config);
}

describe('seed e2e (US5)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    await applySeed(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('creates exactly the FR-030 demo volumes on an empty database', async () => {
    expect(dataset.roomTypes).toHaveLength(ROOM_TYPE_COUNT);
    expect(dataset.styles).toHaveLength(STYLE_COUNT);
    expect(dataset.categories.length).toBeGreaterThanOrEqual(
      MIN_CATEGORY_COUNT,
    );
    expect(dataset.categories.length).toBeLessThanOrEqual(MAX_CATEGORY_COUNT);
    expect(dataset.engineeringItems).toHaveLength(ENGINEERING_ITEM_COUNT);

    const engineeringOptions = dataset.options.filter(
      (option) => option.kind === OptionKind.ENGINEERING,
    );
    const additionalOptions = dataset.options.filter(
      (option) => option.kind === OptionKind.ADDITIONAL,
    );
    expect(engineeringOptions).toHaveLength(ENGINEERING_OPTION_COUNT);
    expect(additionalOptions.length).toBeGreaterThanOrEqual(
      MIN_ADDITIONAL_OPTION_COUNT,
    );

    const [roomTypeCount, styleCount, categoryCount, itemCount, productCount] =
      await Promise.all([
        testApp.prisma.roomType.count(),
        testApp.prisma.style.count(),
        testApp.prisma.category.count(),
        testApp.prisma.engineeringPackageItem.count(),
        testApp.prisma.product.count(),
      ]);

    expect(roomTypeCount).toBe(dataset.roomTypes.length);
    expect(styleCount).toBe(dataset.styles.length);
    expect(categoryCount).toBe(dataset.categories.length);
    expect(itemCount).toBe(dataset.engineeringItems.length);
    expect(productCount).toBe(dataset.products.length);

    const [engineeringOptionCount, additionalOptionCount] = await Promise.all([
      testApp.prisma.option.count({
        where: { kind: OptionKind.ENGINEERING },
      }),
      testApp.prisma.option.count({
        where: { kind: OptionKind.ADDITIONAL },
      }),
    ]);
    expect(engineeringOptionCount).toBe(engineeringOptions.length);
    expect(additionalOptionCount).toBe(additionalOptions.length);

    const productsByCategory = await testApp.prisma.product.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
    });

    expect(productsByCategory).toHaveLength(dataset.categories.length);
    for (const group of productsByCategory) {
      expect(group._count._all).toBeGreaterThanOrEqual(
        MIN_PRODUCTS_PER_CATEGORY,
      );
      expect(group._count._all).toBeLessThanOrEqual(MAX_PRODUCTS_PER_CATEGORY);
    }
  });

  it('does not duplicate rows when applied a second time', async () => {
    const before = await snapshotCatalogTables(testApp.prisma);

    await applySeed(testApp);

    const after = await snapshotCatalogTables(testApp.prisma);

    expect(after).toEqual(before);
  });

  it('gives every room type at least 4 categories with published products (US1 on seed data)', async () => {
    const response = await request(testApp.http)
      .get('/api/v1/public/room-types')
      .query({ lang: 'en' });

    expect(response.status).toBe(200);

    const items: PublicRoomTypeSummary[] = response.body.items;
    expect(items).toHaveLength(ROOM_TYPE_COUNT);

    for (const item of items) {
      const withProducts = item.categories.filter(
        (category) => category.productCount > 0,
      );
      expect(
        withProducts.length,
        `room type ${item.code} categories with products`,
      ).toBeGreaterThanOrEqual(MIN_CATEGORIES_WITH_PRODUCTS_PER_ROOM_TYPE);
    }
  });

  it('fills every room type x category pair for the fully filled style', async () => {
    const totalPairs = await testApp.prisma.roomTypeCategory.count();
    const styleId = await findFullyFilledStyleId(testApp.prisma, totalPairs);

    const response = await request(testApp.http).get(
      `/api/v1/public/styles/${styleId}/default-materials`,
    );

    expect(response.status).toBe(200);
    expect(response.body.styleId).toBe(styleId);

    const items: DefaultMaterialPair[] = response.body.items;
    expect(items).toHaveLength(totalPairs);

    for (const pair of items) {
      expect(
        pair.productId,
        `pair ${pair.roomTypeCode} x ${pair.categoryId}`,
      ).not.toBeNull();
    }
  });

  it('gives every published entity non-empty English and Ukrainian text (SC-004, SC-005)', async () => {
    const [
      roomTypes,
      publishedCategories,
      publishedProducts,
      publishedStyles,
      publishedEngineeringItems,
      publishedOptions,
      publishedMaterialTypes,
    ] = await Promise.all([
      testApp.prisma.roomType.findMany(),
      testApp.prisma.category.findMany({
        where: { status: PublicationStatus.PUBLISHED },
      }),
      testApp.prisma.product.findMany({
        where: { status: PublicationStatus.PUBLISHED },
      }),
      testApp.prisma.style.findMany({
        where: { status: PublicationStatus.PUBLISHED },
      }),
      testApp.prisma.engineeringPackageItem.findMany({
        where: { status: PublicationStatus.PUBLISHED },
      }),
      testApp.prisma.option.findMany({
        where: { status: PublicationStatus.PUBLISHED },
      }),
      testApp.prisma.materialType.findMany({
        where: { status: PublicationStatus.PUBLISHED },
      }),
    ]);

    expect(roomTypes.length).toBeGreaterThan(0);
    expect(publishedCategories.length).toBeGreaterThan(0);
    expect(publishedProducts.length).toBeGreaterThan(0);
    expect(publishedStyles.length).toBeGreaterThan(0);
    expect(publishedEngineeringItems.length).toBeGreaterThan(0);
    expect(publishedOptions.length).toBeGreaterThan(0);

    for (const roomType of roomTypes) {
      assertLocalizedText(roomType.name, `roomType ${roomType.id}.name`);
    }
    for (const category of publishedCategories) {
      assertLocalizedText(category.name, `category ${category.id}.name`);
    }
    for (const product of publishedProducts) {
      assertLocalizedText(product.name, `product ${product.id}.name`);
      assertLocalizedText(
        product.description,
        `product ${product.id}.description`,
      );
    }
    for (const style of publishedStyles) {
      assertLocalizedText(style.name, `style ${style.id}.name`);
      assertLocalizedText(style.description, `style ${style.id}.description`);
    }
    for (const item of publishedEngineeringItems) {
      assertLocalizedText(item.name, `engineeringPackageItem ${item.id}.name`);
      assertLocalizedText(
        item.description,
        `engineeringPackageItem ${item.id}.description`,
      );
    }
    for (const option of publishedOptions) {
      assertLocalizedText(option.name, `option ${option.id}.name`);
      assertLocalizedText(
        option.description,
        `option ${option.id}.description`,
      );
    }
    for (const materialType of publishedMaterialTypes) {
      assertLocalizedText(
        materialType.name,
        `materialType ${materialType.id}.name`,
      );
    }

    const [
      stylesEn,
      stylesUk,
      roomTypesEn,
      roomTypesUk,
      engineeringEn,
      engineeringUk,
    ] = await Promise.all([
      request(testApp.http).get('/api/v1/public/styles').query({ lang: 'en' }),
      request(testApp.http).get('/api/v1/public/styles').query({ lang: 'uk' }),
      request(testApp.http)
        .get('/api/v1/public/room-types')
        .query({ lang: 'en' }),
      request(testApp.http)
        .get('/api/v1/public/room-types')
        .query({ lang: 'uk' }),
      request(testApp.http)
        .get('/api/v1/public/engineering')
        .query({ lang: 'en' }),
      request(testApp.http)
        .get('/api/v1/public/engineering')
        .query({ lang: 'uk' }),
    ]);

    for (const response of [
      stylesEn,
      stylesUk,
      roomTypesEn,
      roomTypesUk,
      engineeringEn,
      engineeringUk,
    ]) {
      expect(response.status).toBe(200);
    }

    assertNonEmptyNames(stylesEn.body.items);
    assertNonEmptyNames(stylesUk.body.items);

    const roomTypeItemsEn: PublicRoomTypeSummary[] = roomTypesEn.body.items;
    const roomTypeItemsUk: PublicRoomTypeSummary[] = roomTypesUk.body.items;
    assertNonEmptyNames(roomTypeItemsEn);
    assertNonEmptyNames(roomTypeItemsUk);
    for (const roomType of roomTypeItemsEn) {
      assertNonEmptyNames(roomType.categories);
    }
    for (const roomType of roomTypeItemsUk) {
      assertNonEmptyNames(roomType.categories);
    }

    assertNonEmptyNames(engineeringEn.body.packageItems);
    assertNonEmptyNames(engineeringUk.body.packageItems);
    assertNonEmptyNames(engineeringEn.body.options);
    assertNonEmptyNames(engineeringUk.body.options);

    const categoryWithProducts = roomTypeItemsEn
      .flatMap((item) => item.categories)
      .find((category) => category.productCount > 0);
    expect(categoryWithProducts).toBeDefined();

    const [productsEn, productsUk] = await Promise.all([
      request(testApp.http)
        .get(`/api/v1/public/categories/${categoryWithProducts?.id}/products`)
        .query({ lang: 'en' }),
      request(testApp.http)
        .get(`/api/v1/public/categories/${categoryWithProducts?.id}/products`)
        .query({ lang: 'uk' }),
    ]);

    expect(productsEn.status).toBe(200);
    expect(productsUk.status).toBe(200);
    assertNonEmptyNames(productsEn.body.items);
    assertNonEmptyNames(productsUk.body.items);
  });

  it('exposes a heated-floor room-sqm engineering option and a heated-floor-compatible floor product', async () => {
    const heatedFloorOption = await testApp.prisma.option.findFirst({
      where: { kind: OptionKind.ENGINEERING, unit: OptionUnit.ROOM_SQM },
      include: { optionRoomTypes: { include: { roomType: true } } },
    });

    expect(heatedFloorOption).not.toBeNull();

    const roomTypeCodes = (heatedFloorOption?.optionRoomTypes ?? [])
      .map((entry) => entry.roomType.code)
      .sort();
    expect(roomTypeCodes).toEqual(HEATED_FLOOR_ROOM_TYPES);

    const heatedFloorProduct = await testApp.prisma.product.findFirst({
      where: {
        status: PublicationStatus.PUBLISHED,
        heatedFloorCompatible: true,
        category: { surface: SurfaceKind.FLOOR },
      },
    });

    expect(heatedFloorProduct).not.toBeNull();
  });
});

describe('seed e2e — admin edits survive a re-seed', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    await applySeed(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('moves an admin option out of the way of the seeded order of its kind', async () => {
    const [seeded] = [...dataset.options].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const sameKind = dataset.options.filter(
      (option) => option.kind === seeded.kind,
    );
    const lastSeeded = Math.max(...sameKind.map((option) => option.sortOrder));

    await testApp.prisma.option.update({
      where: { id: seeded.id },
      data: { sortOrder: lastSeeded + 10 },
    });
    const admin = await testApp.prisma.option.create({
      data: {
        kind: seeded.kind,
        name: { en: 'Admin option', uk: 'Опція адміна' },
        description: { en: 'Admin option', uk: 'Опція адміна' },
        priceCents: 100,
        unit: OptionUnit.PIECE,
        sortOrder: seeded.sortOrder,
      },
    });

    await applySeed(testApp);

    const options = await testApp.prisma.option.findMany({
      where: { kind: seeded.kind },
      select: { id: true, sortOrder: true },
    });
    const sortOrderById = new Map(
      options.map((option) => [option.id, option.sortOrder]),
    );
    for (const option of sameKind) {
      expect(sortOrderById.get(option.id), option.id).toBe(option.sortOrder);
    }
    expect(sortOrderById.get(admin.id)).toBe(lastSeeded + 1);
  });

  it('keeps an admin room type category link and its style default', async () => {
    const [roomType] = dataset.roomTypes;
    const [materialType] = dataset.materialTypes;

    const category = await testApp.prisma.category.create({
      data: {
        name: { en: 'Admin category', uk: 'Категорія адміна' },
        wastePercent: 5,
        surface: SurfaceKind.FLOOR,
      },
    });
    const product = await testApp.prisma.product.create({
      data: {
        categoryId: category.id,
        materialTypeId: materialType.id,
        name: { en: 'Admin product', uk: 'Товар адміна' },
        description: { en: 'Admin product', uk: 'Товар адміна' },
        brand: 'Admin',
        manufacturer: 'Admin',
        color: { en: 'White', uk: 'Білий' },
        size: { en: '1 m', uk: '1 м' },
        priceCents: 100,
        unit: ProductUnit.SQM,
      },
    });
    const style = await testApp.prisma.style.create({
      data: {
        name: { en: 'Admin style', uk: 'Стиль адміна' },
        description: { en: 'Admin style', uk: 'Стиль адміна' },
        sortOrder: 100,
      },
    });
    await testApp.prisma.roomTypeCategory.updateMany({
      where: { roomTypeId: roomType.id },
      data: { sortOrder: { increment: 100 } },
    });
    await testApp.prisma.roomTypeCategory.create({
      data: { roomTypeId: roomType.id, categoryId: category.id, sortOrder: 0 },
    });
    await testApp.prisma.styleDefaultMaterial.create({
      data: {
        styleId: style.id,
        roomTypeId: roomType.id,
        categoryId: category.id,
        productId: product.id,
      },
    });

    await applySeed(testApp);

    const links = await testApp.prisma.roomTypeCategory.findMany({
      where: { roomTypeId: roomType.id },
      orderBy: { sortOrder: 'asc' },
      select: { categoryId: true, sortOrder: true },
    });
    expect(links).toEqual([
      ...roomType.categoryIds.map((categoryId, sortOrder) => ({
        categoryId,
        sortOrder,
      })),
      { categoryId: category.id, sortOrder: roomType.categoryIds.length },
    ]);

    const styleDefault = await testApp.prisma.styleDefaultMaterial.findUnique({
      where: {
        styleId_roomTypeId_categoryId: {
          styleId: style.id,
          roomTypeId: roomType.id,
          categoryId: category.id,
        },
      },
    });
    expect(styleDefault?.productId).toBe(product.id);
  });

  it('matches an existing material type by code instead of duplicating it', async () => {
    const [materialType] = dataset.materialTypes;
    const renamedId = '00000000-0000-4000-8000-000000000001';
    const countBefore = await testApp.prisma.materialType.count();

    await testApp.prisma.materialType.update({
      where: { id: materialType.id },
      data: { id: renamedId },
    });

    await applySeed(testApp);

    const matching = await testApp.prisma.materialType.findMany({
      where: { code: materialType.code },
      select: { id: true },
    });
    expect(matching).toEqual([{ id: materialType.id }]);
    expect(await testApp.prisma.materialType.count()).toBe(countBefore);
    expect(
      await testApp.prisma.product.count({
        where: { materialTypeId: renamedId },
      }),
    ).toBe(0);
  });
});

describe('health e2e — database unreachable (US5 scenario 3)', () => {
  it('responds 200 with database: "down" when the database is unreachable', async () => {
    const brokenPrisma = createUnreachablePrismaService();
    const testApp = await createTestApp({
      overrides: [{ provide: PrismaService, useValue: brokenPrisma }],
    });

    try {
      const response = await request(testApp.http).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ service: 'up', database: 'down' });
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      await testApp.close();
    }
  });
});
