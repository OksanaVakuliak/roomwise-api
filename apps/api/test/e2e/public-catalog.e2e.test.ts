import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { RoomTypeCode } from '../../src/generated/prisma/client';
import { createTestApp, type TestApp } from './app-factory';
import {
  createPublicCatalogFixtures,
  PUBLIC_CATALOG_FIXTURE_DATA,
  type PublicCatalogFixtures,
} from './public-catalog-fixtures';

const CACHE_CONTROL_HEADER = 'public, max-age=30';
const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

interface ImageRefBody {
  id: string;
  thumb: string;
  card: string;
  zoom: string;
}

interface TextureRefBody {
  id: string;
  url: string;
}

function assertCloudinaryVariant(
  url: string,
  expectedToken: string,
  publicId: string,
): void {
  expect(url).toMatch(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//,
  );
  expect(url).toContain(expectedToken);
  expect(url.endsWith(`/${publicId}`)).toBe(true);
}

function assertImageRef(image: ImageRefBody, publicId: string): void {
  expect(typeof image.id).toBe('string');
  assertCloudinaryVariant(image.thumb, 'w_320', publicId);
  assertCloudinaryVariant(image.card, 'w_640', publicId);
  assertCloudinaryVariant(image.zoom, 'w_1600', publicId);
}

function assertTextureRef(texture: TextureRefBody, publicId: string): void {
  expect(typeof texture.id).toBe('string');
  assertCloudinaryVariant(texture.url, 'f_jpg', publicId);
}

describe('public catalog e2e', () => {
  let testApp: TestApp;
  let fixtures: PublicCatalogFixtures;

  beforeAll(async () => {
    testApp = await createTestApp();
    fixtures = await createPublicCatalogFixtures(testApp.prisma);
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('GET /api/v1/public/styles', () => {
    it('returns published styles ordered by sortOrder in Ukrainian', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/styles')
        .query({ lang: 'uk' });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(response.body.items).toHaveLength(2);

      const [first, second] = response.body.items;
      expect(first.id).toBe(fixtures.styles.scandinavian);
      expect(first.name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.styles.scandinavian.uk,
      );
      assertImageRef(first.image, fixtures.images.styleScandinavian.publicId);

      expect(second.id).toBe(fixtures.styles.modern);
      expect(second.name).toBe(PUBLIC_CATALOG_FIXTURE_DATA.styles.modern.uk);

      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(fixtures.styles.hidden);
    });

    it('returns published styles in English by default', async () => {
      const response = await request(testApp.http).get('/api/v1/public/styles');

      expect(response.status).toBe(200);
      expect(response.body.items[0].name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.styles.scandinavian.en,
      );
      expect(response.body.items[1].name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.styles.modern.en,
      );
    });

    it('falls back to English for an unsupported language', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/styles')
        .query({ lang: 'fr' });

      expect(response.status).toBe(200);
      expect(response.body.items[0].name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.styles.scandinavian.en,
      );
    });
  });

  describe('GET /api/v1/public/room-types', () => {
    it('returns all five room types with an ordered, filtered category set in Ukrainian', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/room-types')
        .query({ lang: 'uk' });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(response.body.items).toHaveLength(5);

      const codes = response.body.items.map(
        (item: { code: string }) => item.code,
      );
      expect(codes.sort()).toEqual(
        [
          RoomTypeCode.LIVING_ROOM,
          RoomTypeCode.BEDROOM,
          RoomTypeCode.KITCHEN,
          RoomTypeCode.KITCHEN_LIVING,
          RoomTypeCode.BATHROOM,
        ].sort(),
      );

      const items: Array<{
        code: string;
        name: string;
        categories: Array<{
          id: string;
          name: string;
          surface: string;
          wastePercent: number;
          productCount: number;
        }>;
      }> = response.body.items;

      const livingRoom = items.find(
        (item) => item.code === RoomTypeCode.LIVING_ROOM,
      );
      expect(livingRoom?.name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.roomTypes.livingRoom.uk,
      );
      expect(livingRoom?.categories).toEqual([
        {
          id: fixtures.categories.flooring,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.name.uk,
          surface: 'FLOOR',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.wastePercent,
          productCount: 2,
        },
        {
          id: fixtures.categories.lighting,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.lighting.name.uk,
          surface: 'NONE',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.lighting.wastePercent,
          productCount: 1,
        },
      ]);

      const bedroom = items.find((item) => item.code === RoomTypeCode.BEDROOM);
      expect(bedroom?.categories).toEqual([
        {
          id: fixtures.categories.flooring,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.name.uk,
          surface: 'FLOOR',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.wastePercent,
          productCount: 2,
        },
      ]);

      const kitchen = items.find((item) => item.code === RoomTypeCode.KITCHEN);
      expect(kitchen?.categories).toEqual([
        {
          id: fixtures.categories.flooring,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.name.uk,
          surface: 'FLOOR',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.wastePercent,
          productCount: 2,
        },
      ]);
      const kitchenCategoryIds = kitchen?.categories.map(
        (category) => category.id,
      );
      expect(kitchenCategoryIds).not.toContain(fixtures.categories.archived);

      const kitchenLiving = items.find(
        (item) => item.code === RoomTypeCode.KITCHEN_LIVING,
      );
      expect(kitchenLiving?.categories).toEqual([
        {
          id: fixtures.categories.flooring,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.name.uk,
          surface: 'FLOOR',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.wastePercent,
          productCount: 2,
        },
        {
          id: fixtures.categories.walls,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.walls.name.uk,
          surface: 'WALLS',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.walls.wastePercent,
          productCount: 0,
        },
      ]);
      const kitchenLivingCategoryIds = kitchenLiving?.categories.map(
        (category) => category.id,
      );
      expect(kitchenLivingCategoryIds).not.toContain(
        fixtures.categories.lighting,
      );

      const bathroom = items.find(
        (item) => item.code === RoomTypeCode.BATHROOM,
      );
      expect(bathroom?.categories).toEqual([
        {
          id: fixtures.categories.flooring,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.name.uk,
          surface: 'FLOOR',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.wastePercent,
          productCount: 2,
        },
        {
          id: fixtures.categories.lighting,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.lighting.name.uk,
          surface: 'NONE',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.lighting.wastePercent,
          productCount: 1,
        },
        {
          id: fixtures.categories.empty,
          name: PUBLIC_CATALOG_FIXTURE_DATA.categories.empty.name.uk,
          surface: 'NONE',
          wastePercent:
            PUBLIC_CATALOG_FIXTURE_DATA.categories.empty.wastePercent,
          productCount: 0,
        },
      ]);
      const bathroomCategoryIds = bathroom?.categories.map(
        (category) => category.id,
      );
      expect(bathroomCategoryIds).not.toContain(fixtures.categories.walls);
    });

    it('returns English names by default', async () => {
      const response = await request(testApp.http).get(
        '/api/v1/public/room-types',
      );

      expect(response.status).toBe(200);
      const bathroom = response.body.items.find(
        (item: { code: string }) => item.code === RoomTypeCode.BATHROOM,
      );
      expect(bathroom.name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.roomTypes.bathroom.en,
      );
      expect(bathroom.categories[0].name).toBe(
        PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.name.en,
      );
    });
  });

  describe('GET /api/v1/public/categories/:categoryId/products', () => {
    it('returns only published products of the category as showcase cards', async () => {
      const response = await request(testApp.http)
        .get(
          `/api/v1/public/categories/${fixtures.categories.flooring}/products`,
        )
        .query({ lang: 'uk' });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(response.body.items).toHaveLength(2);

      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(fixtures.products.a);
      expect(ids).toContain(fixtures.products.b);
      expect(ids).not.toContain(fixtures.products.draft);
      expect(ids).not.toContain(fixtures.products.archived);

      const productA = response.body.items.find(
        (item: { id: string }) => item.id === fixtures.products.a,
      );
      expect(productA).toMatchObject({
        name: PUBLIC_CATALOG_FIXTURE_DATA.products.a.name.uk,
        brand: PUBLIC_CATALOG_FIXTURE_DATA.products.a.brand,
        manufacturer: PUBLIC_CATALOG_FIXTURE_DATA.products.a.manufacturer,
        size: PUBLIC_CATALOG_FIXTURE_DATA.products.a.size.uk,
        color: PUBLIC_CATALOG_FIXTURE_DATA.products.a.color.uk,
        priceCents: PUBLIC_CATALOG_FIXTURE_DATA.products.a.priceCents,
        unit: 'SQM',
        materialTypeCode: fixtures.materialTypeCode,
        heatedFloorCompatible: true,
      });
      assertImageRef(productA.image, fixtures.images.productAPrimary.publicId);
    });

    it('returns an empty list for a published category without products', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/categories/${fixtures.categories.empty}/products`,
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
    });

    it('returns NOT_FOUND for an unpublished category', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/categories/${fixtures.categories.draft}/products`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('returns NOT_FOUND for an archived category', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/categories/${fixtures.categories.archived}/products`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('returns NOT_FOUND for a nonexistent category', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/categories/${RANDOM_UUID}/products`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  describe('GET /api/v1/public/products/:productId', () => {
    it('returns surface details, effective waste percent, images, and attributes for a surface product', async () => {
      const response = await request(testApp.http)
        .get(`/api/v1/public/products/${fixtures.products.a}`)
        .query({ lang: 'uk' });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(response.body).toMatchObject({
        id: fixtures.products.a,
        categoryId: fixtures.categories.flooring,
        name: PUBLIC_CATALOG_FIXTURE_DATA.products.a.name.uk,
        description: PUBLIC_CATALOG_FIXTURE_DATA.products.a.description.uk,
        brand: PUBLIC_CATALOG_FIXTURE_DATA.products.a.brand,
        manufacturer: PUBLIC_CATALOG_FIXTURE_DATA.products.a.manufacturer,
        priceCents: PUBLIC_CATALOG_FIXTURE_DATA.products.a.priceCents,
        unit: 'SQM',
        materialTypeCode: fixtures.materialTypeCode,
        heatedFloorCompatible: true,
        wastePercent:
          PUBLIC_CATALOG_FIXTURE_DATA.categories.flooring.wastePercent,
      });

      expect(response.body.images).toHaveLength(2);
      expect(response.body.images[0].id).toBeTruthy();
      assertImageRef(
        response.body.images[0],
        fixtures.images.productAPrimary.publicId,
      );
      assertImageRef(
        response.body.images[1],
        fixtures.images.productASecondary.publicId,
      );

      expect(response.body.attributes).toEqual([
        {
          name: PUBLIC_CATALOG_FIXTURE_DATA.products.a.attributes[0].name.uk,
          value: PUBLIC_CATALOG_FIXTURE_DATA.products.a.attributes[0].value.uk,
        },
        {
          name: PUBLIC_CATALOG_FIXTURE_DATA.products.a.attributes[1].name.uk,
          value: PUBLIC_CATALOG_FIXTURE_DATA.products.a.attributes[1].value.uk,
        },
      ]);

      expect(response.body.surface.kind).toBe('FLOOR');
      expect(response.body.surface.tileWidthMm).toBe(193);
      expect(response.body.surface.tileLengthMm).toBe(1380);
      expect(response.body.surface.fallbackColor).toBe('#B08D62');
      assertTextureRef(
        response.body.surface.texture,
        fixtures.images.productATexture.publicId,
      );
    });

    it('returns the overridden waste percent when the product has one', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/products/${fixtures.products.b}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.wastePercent).toBe(15);
    });

    it('returns surface: null for a product in a non-surface category', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/products/${fixtures.products.lighting}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.surface).toBeNull();
    });

    it('returns PRODUCT_UNAVAILABLE for an unpublished product', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/products/${fixtures.products.draft}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it('returns PRODUCT_UNAVAILABLE for an archived product', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/products/${fixtures.products.archived}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it('returns NOT_FOUND for a nonexistent product', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/products/${RANDOM_UUID}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  describe('GET /api/v1/public/styles/:styleId/default-materials', () => {
    it('returns every room type x category pair, nulling out unfilled or unavailable ones', async () => {
      const response = await request(testApp.http).get(
        `/api/v1/public/styles/${fixtures.styles.scandinavian}/default-materials`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(response.body.styleId).toBe(fixtures.styles.scandinavian);
      expect(response.body.items).toHaveLength(9);

      const items: Array<{
        roomTypeCode: string;
        categoryId: string;
        productId: string | null;
      }> = response.body.items;

      function findPair(roomTypeCode: string, categoryId: string) {
        const pair = items.find(
          (item) =>
            item.roomTypeCode === roomTypeCode &&
            item.categoryId === categoryId,
        );
        if (!pair) {
          throw new Error(
            `Missing pair for ${roomTypeCode} x ${categoryId} in default-materials response`,
          );
        }
        return pair;
      }

      expect(
        findPair(RoomTypeCode.LIVING_ROOM, fixtures.categories.flooring)
          .productId,
      ).toBe(fixtures.products.a);
      expect(
        findPair(RoomTypeCode.LIVING_ROOM, fixtures.categories.lighting)
          .productId,
      ).toBe(fixtures.products.lighting);
      expect(
        findPair(RoomTypeCode.BEDROOM, fixtures.categories.flooring).productId,
      ).toBe(fixtures.products.b);

      expect(
        findPair(RoomTypeCode.BATHROOM, fixtures.categories.flooring).productId,
      ).toBeNull();
      expect(
        findPair(RoomTypeCode.BATHROOM, fixtures.categories.lighting).productId,
      ).toBeNull();
      expect(
        findPair(RoomTypeCode.BATHROOM, fixtures.categories.empty).productId,
      ).toBeNull();
      expect(
        findPair(RoomTypeCode.KITCHEN, fixtures.categories.flooring).productId,
      ).toBeNull();
      expect(
        findPair(RoomTypeCode.KITCHEN_LIVING, fixtures.categories.flooring)
          .productId,
      ).toBeNull();
      expect(
        findPair(RoomTypeCode.KITCHEN_LIVING, fixtures.categories.walls)
          .productId,
      ).toBeNull();
    });
  });

  describe('GET /api/v1/public/engineering', () => {
    it('returns package items and options for both engineering and additional kinds', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/engineering')
        .query({ lang: 'uk' });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(response.body.packageItems).toHaveLength(2);

      const packageItemIds = response.body.packageItems.map(
        (item: { id: string }) => item.id,
      );
      expect(packageItemIds).not.toContain(
        fixtures.engineering.packageItemDraft,
      );

      const includedItem = response.body.packageItems.find(
        (item: { id: string }) =>
          item.id === fixtures.engineering.packageItemIncluded,
      );
      expect(includedItem).toMatchObject({
        name: PUBLIC_CATALOG_FIXTURE_DATA.engineering.packageItemIncluded.uk,
        includedInBase: true,
        priceCents: null,
        unit: null,
      });

      const pricedItem = response.body.packageItems.find(
        (item: { id: string }) =>
          item.id === fixtures.engineering.packageItemPriced,
      );
      expect(pricedItem).toMatchObject({
        name: PUBLIC_CATALOG_FIXTURE_DATA.engineering.packageItemPriced.uk,
        includedInBase: false,
        priceCents: 5000,
        unit: 'PROJECT',
      });

      expect(response.body.options).toHaveLength(4);
      const optionIds = response.body.options.map(
        (option: { id: string }) => option.id,
      );
      expect(optionIds).not.toContain(fixtures.engineering.optionDraft);

      const roomSqmOption = response.body.options.find(
        (option: { id: string }) =>
          option.id === fixtures.engineering.optionRoomSqmRestricted,
      );
      expect(roomSqmOption.kind).toBe('ENGINEERING');
      expect(roomSqmOption.perRoom).toBe(true);
      expect([...roomSqmOption.roomTypeCodes].sort()).toEqual(
        [RoomTypeCode.BATHROOM, RoomTypeCode.KITCHEN].sort(),
      );
      expect(roomSqmOption.minQuantity).toBeNull();
      expect(roomSqmOption.maxQuantity).toBeNull();

      const roomAllOption = response.body.options.find(
        (option: { id: string }) =>
          option.id === fixtures.engineering.optionRoomAll,
      );
      expect(roomAllOption.perRoom).toBe(true);
      expect(roomAllOption.roomTypeCodes).toEqual([]);

      const pieceOption = response.body.options.find(
        (option: { id: string }) =>
          option.id === fixtures.engineering.optionPiece,
      );
      expect(pieceOption.perRoom).toBe(false);
      expect(pieceOption.minQuantity).toBe(1);
      expect(pieceOption.maxQuantity).toBe(3);

      const additionalOption = response.body.options.find(
        (option: { id: string }) =>
          option.id === fixtures.engineering.optionAdditionalProject,
      );
      expect(additionalOption.kind).toBe('ADDITIONAL');
      expect(additionalOption.perRoom).toBe(false);
      expect(additionalOption.roomTypeCodes).toEqual([]);
    });
  });
});
