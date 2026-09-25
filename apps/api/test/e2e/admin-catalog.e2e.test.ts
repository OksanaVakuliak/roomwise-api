import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import {
  ProductUnit,
  PublicationStatus,
  SurfaceKind,
} from '../../src/generated/prisma/client';
import { CloudinaryService } from '../../src/modules/catalog/images/cloudinary.service';
import {
  type AdminCatalogRoomTypeIds,
  assignCategoryToRoomType,
  createAdminCatalogRoomTypes,
  createCategoryFixture,
  createImageFixture,
  createMaterialTypeFixture,
  createProductFixture,
  createStyleUsingProductAsDefault,
  localizedText,
  MAX_IMAGE_BYTES,
  oversizedPngBuffer,
  textDisguisedAsPngBuffer,
  validPngBuffer,
} from './admin-catalog-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';
const SMALL_DELAY_MS = 10;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendRequest(
  http: TestApp['http'],
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
) {
  switch (method) {
    case 'get':
      return request(http).get(path);
    case 'post':
      return request(http).post(path);
    case 'put':
      return request(http).put(path);
    case 'delete':
      return request(http).delete(path);
  }
}

interface FakeCloudinaryUploadResult {
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

interface FakeCloudinaryService {
  shouldFail: boolean;
  upload(buffer: Buffer): Promise<FakeCloudinaryUploadResult>;
  destroy(publicId: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
}

function createFakeCloudinaryService(): FakeCloudinaryService {
  const service: FakeCloudinaryService = {
    shouldFail: false,
    async upload(buffer: Buffer): Promise<FakeCloudinaryUploadResult> {
      if (service.shouldFail) {
        throw new Error('fake cloudinary upload failure');
      }
      return {
        publicId: `roomwise/uploads/fake-${randomUUID()}`,
        width: 1,
        height: 1,
        format: 'png',
        bytes: buffer.length,
      };
    },
    async destroy(): Promise<void> {},
    async deleteByPrefix(): Promise<void> {},
  };
  return service;
}

function assertCloudinaryVariant(url: unknown, expectedToken: string): void {
  expect(typeof url).toBe('string');
  expect(url as string).toMatch(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//,
  );
  expect(url as string).toContain(expectedToken);
}

const PROTECTED_ROUTES: Array<{
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
}> = [
  { method: 'get', path: '/api/v1/admin/categories' },
  { method: 'post', path: '/api/v1/admin/categories' },
  { method: 'get', path: '/api/v1/admin/room-types' },
  { method: 'put', path: `/api/v1/admin/room-types/${RANDOM_UUID}/categories` },
  { method: 'get', path: '/api/v1/admin/material-types' },
  { method: 'post', path: '/api/v1/admin/material-types' },
  { method: 'get', path: '/api/v1/admin/products' },
  { method: 'post', path: '/api/v1/admin/products' },
  { method: 'delete', path: `/api/v1/admin/products/${RANDOM_UUID}` },
  { method: 'delete', path: `/api/v1/admin/categories/${RANDOM_UUID}` },
  { method: 'post', path: '/api/v1/admin/images' },
];

interface ProductInputOverrides {
  categoryId: string;
  materialTypeId: string;
  name?: { en: string; uk: string };
  description?: { en: string; uk: string };
  priceCents?: number;
  confirmZeroPrice?: boolean;
  unit?: ProductUnit;
  images?: Array<{ imageId: string; isPrimary: boolean }>;
  textureImageId?: string;
  tileWidthMm?: number;
  tileLengthMm?: number;
  fallbackColor?: string;
}

function buildProductInput(overrides: ProductInputOverrides) {
  return {
    categoryId: overrides.categoryId,
    materialTypeId: overrides.materialTypeId,
    name: overrides.name ?? localizedText('Test Product', 'Тестовий товар'),
    description:
      overrides.description ??
      localizedText('A test product.', 'Тестовий товар.'),
    brand: 'Roomwise',
    manufacturer: 'Roomwise Manufacturing',
    color: localizedText('White', 'Білий'),
    size: localizedText('1x1 m', '1x1 м'),
    priceCents: overrides.priceCents ?? 150_000,
    confirmZeroPrice: overrides.confirmZeroPrice ?? false,
    unit: overrides.unit ?? ProductUnit.PIECE,
    heatedFloorCompatible: false,
    images: overrides.images ?? [],
    attributes: [],
    textureImageId: overrides.textureImageId,
    tileWidthMm: overrides.tileWidthMm,
    tileLengthMm: overrides.tileLengthMm,
    fallbackColor: overrides.fallbackColor,
  };
}

describe('admin catalog e2e', () => {
  let testApp: TestApp;
  let roomTypes: AdminCatalogRoomTypeIds;
  let adminCookie: string;
  let adminId: string;
  let adminLogin: string;
  let fakeCloudinary: FakeCloudinaryService;

  beforeAll(async () => {
    fakeCloudinary = createFakeCloudinaryService();

    testApp = await createTestApp({
      overrides: [{ provide: CloudinaryService, useValue: fakeCloudinary }],
    });

    roomTypes = await createAdminCatalogRoomTypes(testApp.prisma);

    const admin = await createAdmin(testApp.prisma);
    adminId = admin.id;
    adminLogin = admin.login;
    adminCookie = await login(testApp.http, admin.login, admin.password);
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('authentication', () => {
    for (const route of PROTECTED_ROUTES) {
      it(`rejects ${route.method} ${route.path} without a session`, async () => {
        const response = await sendRequest(
          testApp.http,
          route.method,
          route.path,
        );

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: { code: ERROR_CODES.UNAUTHENTICATED },
        });
      });
    }
  });

  describe('categories', () => {
    it('creates a category in DRAFT status', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookie)
        .send({
          name: localizedText('Skirting', 'Плінтус'),
          wastePercent: 8,
          surface: SurfaceKind.NONE,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(PublicationStatus.DRAFT);
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.revision).toBe('string');
    });

    it('rejects publishing a category without a translation with TRANSLATION_MISSING', async () => {
      const created = await request(testApp.http)
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookie)
        .send({
          name: { en: 'Untranslated Category', uk: '' },
          wastePercent: 5,
          surface: SurfaceKind.NONE,
        });

      const response = await request(testApp.http)
        .post(`/api/v1/admin/categories/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.TRANSLATION_MISSING);
      expect(response.body.error.params.fields).toEqual(
        expect.arrayContaining([expect.stringContaining('name')]),
      );
    });

    it('publishes a category once fully translated', async () => {
      const created = await request(testApp.http)
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookie)
        .send({
          name: localizedText('Walls', 'Стіни'),
          wastePercent: 7,
          surface: SurfaceKind.WALLS,
        });

      const response = await request(testApp.http)
        .post(`/api/v1/admin/categories/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(PublicationStatus.PUBLISHED);
    });

    it('rejects deleting a category with products or a room type assignment with CATEGORY_IN_USE', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        status: PublicationStatus.PUBLISHED,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
      });
      await assignCategoryToRoomType(
        testApp.prisma,
        roomTypes.bathroom,
        category.id,
        1,
      );

      const response = await request(testApp.http)
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.CATEGORY_IN_USE);
      expect(response.body.error.params.productCount).toBeGreaterThanOrEqual(1);
      expect(response.body.error.params.roomTypeCodes).toEqual(
        expect.arrayContaining(['BATHROOM']),
      );
    });

    it('deletes an unused category', async () => {
      const category = await createCategoryFixture(testApp.prisma);

      const response = await request(testApp.http)
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(204);
    });

    it('rejects deleting a category used only as a style default material with CATEGORY_IN_USE', async () => {
      const category = await createCategoryFixture(testApp.prisma);
      const otherCategory = await createCategoryFixture(testApp.prisma);
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const product = await createProductFixture(testApp.prisma, {
        categoryId: otherCategory.id,
        materialTypeId: materialType.id,
      });
      const style = await createStyleUsingProductAsDefault(testApp.prisma, {
        roomTypeId: roomTypes.kitchenLiving,
        categoryId: category.id,
        productId: product.id,
      });

      const response = await request(testApp.http)
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.CATEGORY_IN_USE);
      expect(response.body.error.params.productCount).toBe(0);
      expect(response.body.error.params.roomTypeCodes).toEqual([]);
      expect(
        response.body.error.params.styles.map((s: { id: string }) => s.id),
      ).toEqual(expect.arrayContaining([style.styleId]));
    });

    it('rejects changing a category surface when a published product is missing surface data with SURFACE_DATA_MISSING', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const product = await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
        status: PublicationStatus.PUBLISHED,
      });
      await testApp.prisma.product.update({
        where: { id: product.id },
        data: {
          textureImageId: null,
          tileWidthMm: null,
          tileLengthMm: null,
          fallbackColor: null,
        },
      });

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Cookie', adminCookie)
        .send({ surface: SurfaceKind.FLOOR, revision: category.revision });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.SURFACE_DATA_MISSING);
      expect(response.body.error.params.productIds).toEqual([product.id]);
    });
  });

  describe('room types', () => {
    it('lists the category set for a room type and replaces the order via PUT', async () => {
      const categoryA = await createCategoryFixture(testApp.prisma, {
        status: PublicationStatus.PUBLISHED,
      });
      const categoryB = await createCategoryFixture(testApp.prisma, {
        status: PublicationStatus.PUBLISHED,
      });
      await assignCategoryToRoomType(
        testApp.prisma,
        roomTypes.bedroom,
        categoryA.id,
        1,
      );
      await assignCategoryToRoomType(
        testApp.prisma,
        roomTypes.bedroom,
        categoryB.id,
        2,
      );

      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/room-types')
        .set('Cookie', adminCookie);

      expect(listResponse.status).toBe(200);
      const bedroomEntry = listResponse.body.items.find(
        (item: { id: string }) => item.id === roomTypes.bedroom,
      );
      expect(bedroomEntry.categories.map((c: { id: string }) => c.id)).toEqual([
        categoryA.id,
        categoryB.id,
      ]);

      const putResponse = await request(testApp.http)
        .put(`/api/v1/admin/room-types/${roomTypes.bedroom}/categories`)
        .set('Cookie', adminCookie)
        .send({
          categoryIds: [categoryB.id, categoryA.id],
          revision: bedroomEntry.revision,
        });

      expect(putResponse.status).toBe(200);
      expect(
        putResponse.body.categories.map((c: { id: string }) => c.id),
      ).toEqual([categoryB.id, categoryA.id]);
    });

    it('accepts a draft category with an empty translation and lists it', async () => {
      const draftCategory = await createCategoryFixture(testApp.prisma, {
        name: localizedText('', 'Порожня'),
        status: PublicationStatus.DRAFT,
      });

      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/room-types')
        .set('Cookie', adminCookie);
      const livingRoomEntry = listResponse.body.items.find(
        (item: { id: string }) => item.id === roomTypes.livingRoom,
      );

      const putResponse = await request(testApp.http)
        .put(`/api/v1/admin/room-types/${roomTypes.livingRoom}/categories`)
        .set('Cookie', adminCookie)
        .send({
          categoryIds: [draftCategory.id],
          revision: livingRoomEntry.revision,
        });

      expect(putResponse.status).toBe(200);

      const getResponse = await request(testApp.http)
        .get('/api/v1/admin/room-types')
        .set('Cookie', adminCookie);

      expect(getResponse.status).toBe(200);
      const updatedLivingRoom = getResponse.body.items.find(
        (item: { id: string }) => item.id === roomTypes.livingRoom,
      );
      expect(
        updatedLivingRoom.categories.map((c: { id: string }) => c.id),
      ).toContain(draftCategory.id);
    });

    it('rejects adding an archived category to a room type with CATEGORY_ARCHIVED', async () => {
      const archivedCategory = await createCategoryFixture(testApp.prisma, {
        status: PublicationStatus.ARCHIVED,
      });

      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/room-types')
        .set('Cookie', adminCookie);
      expect(listResponse.status).toBe(200);
      const kitchenEntry = listResponse.body.items.find(
        (item: { id: string }) => item.id === roomTypes.kitchen,
      );

      const response = await request(testApp.http)
        .put(`/api/v1/admin/room-types/${roomTypes.kitchen}/categories`)
        .set('Cookie', adminCookie)
        .send({
          categoryIds: [archivedCategory.id],
          revision: kitchenEntry.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.CATEGORY_ARCHIVED);
    });

    it('rejects a stale revision on the category set with STALE_REVISION', async () => {
      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/room-types')
        .set('Cookie', adminCookie);
      expect(listResponse.status).toBe(200);
      const kitchenLivingEntry = listResponse.body.items.find(
        (item: { id: string }) => item.id === roomTypes.kitchenLiving,
      );

      const response = await request(testApp.http)
        .put(`/api/v1/admin/room-types/${roomTypes.kitchenLiving}/categories`)
        .set('Cookie', adminCookie)
        .send({ categoryIds: [], revision: randomUUID() });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(
        kitchenLivingEntry.revision,
      );
    });
  });

  describe('material types', () => {
    it('creates a material type', async () => {
      const code = `paint_${randomUUID().slice(0, 8)}`;

      const response = await request(testApp.http)
        .post('/api/v1/admin/material-types')
        .set('Cookie', adminCookie)
        .send({ code, name: localizedText('Paint', 'Фарба') });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(code);
    });

    it('rejects a duplicate code with CODE_TAKEN', async () => {
      const code = `laminate_${randomUUID().slice(0, 8)}`;
      await request(testApp.http)
        .post('/api/v1/admin/material-types')
        .set('Cookie', adminCookie)
        .send({ code, name: localizedText('Laminate', 'Ламінат') });

      const response = await request(testApp.http)
        .post('/api/v1/admin/material-types')
        .set('Cookie', adminCookie)
        .send({ code, name: localizedText('Laminate 2', 'Ламінат 2') });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.CODE_TAKEN);
    });

    it('rejects changing the code in PATCH with 400', async () => {
      const materialType = await createMaterialTypeFixture(testApp.prisma);

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/material-types/${materialType.id}`)
        .set('Cookie', adminCookie)
        .send({
          code: `changed_${randomUUID().slice(0, 8)}`,
          revision: materialType.revision,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('products', () => {
    it('creates a product in DRAFT status', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
        status: PublicationStatus.PUBLISHED,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);

      const response = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
          }),
        );

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(PublicationStatus.DRAFT);
    });

    it('rejects a zero price without confirmZeroPrice with ZERO_PRICE_NOT_CONFIRMED', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);

      const response = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
            priceCents: 0,
            confirmZeroPrice: false,
          }),
        );

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(
        ERROR_CODES.ZERO_PRICE_NOT_CONFIRMED,
      );
    });

    it('rejects publishing without a translation with TRANSLATION_MISSING', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const image = await createImageFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
            description: { en: 'Missing translation.', uk: '' },
            images: [{ imageId: image.id, isPrimary: true }],
          }),
        );

      const response = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.TRANSLATION_MISSING);
    });

    it('rejects publishing a surface product missing texture, tile size or fallback color with SURFACE_DATA_MISSING', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.FLOOR,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const image = await createImageFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
            images: [{ imageId: image.id, isPrimary: true }],
          }),
        );

      const response = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.SURFACE_DATA_MISSING);
      expect(response.body.error.params.missing).toEqual(
        expect.arrayContaining(['texture', 'tileSize', 'fallbackColor']),
      );
    });

    it('rejects publishing without a primary image with PRIMARY_IMAGE_MISSING', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
          }),
        );

      const response = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.PRIMARY_IMAGE_MISSING);
    });

    it('publishes a fully filled product', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const image = await createImageFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
            images: [{ imageId: image.id, isPrimary: true }],
          }),
        );

      const response = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(PublicationStatus.PUBLISHED);
    });

    it('rejects a stale revision on PATCH with STALE_REVISION', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
          }),
        );

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ brand: 'New Brand', revision: randomUUID() });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(
        created.body.revision,
      );
    });

    it('updates updatedBy and updatedAt after a mutation', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
          }),
        );

      expect(created.body.updatedBy).toEqual({
        id: adminId,
        login: adminLogin,
      });
      const initialUpdatedAt = created.body.updatedAt;

      await delay(SMALL_DELAY_MS);

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ brand: 'Updated Brand', revision: created.body.revision });

      expect(response.status).toBe(200);
      expect(response.body.updatedBy).toEqual({
        id: adminId,
        login: adminLogin,
      });
      expect(response.body.updatedAt).not.toBe(initialUpdatedAt);
    });

    it('rejects deleting a product used as a style default material with PRODUCT_IN_USE', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const product = await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
      });
      const style = await createStyleUsingProductAsDefault(testApp.prisma, {
        roomTypeId: roomTypes.kitchenLiving,
        categoryId: category.id,
        productId: product.id,
      });

      const response = await request(testApp.http)
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.PRODUCT_IN_USE);
      expect(
        response.body.error.params.styles.map((s: { id: string }) => s.id),
      ).toEqual(expect.arrayContaining([style.styleId]));
    });

    it('rejects changing the category of a product used as a style default material with PRODUCT_IN_USE', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const otherCategory = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const product = await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
      });
      const style = await createStyleUsingProductAsDefault(testApp.prisma, {
        roomTypeId: roomTypes.kitchenLiving,
        categoryId: category.id,
        productId: product.id,
      });

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/products/${product.id}`)
        .set('Cookie', adminCookie)
        .send({ categoryId: otherCategory.id, revision: product.revision });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.PRODUCT_IN_USE);
      expect(
        response.body.error.params.styles.map((s: { id: string }) => s.id),
      ).toEqual(expect.arrayContaining([style.styleId]));
    });

    it('archives a product used as a style default material with a warning', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const product = await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
      });
      const style = await createStyleUsingProductAsDefault(testApp.prisma, {
        roomTypeId: roomTypes.kitchenLiving,
        categoryId: category.id,
        productId: product.id,
      });

      const response = await request(testApp.http)
        .post(`/api/v1/admin/products/${product.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.ARCHIVED,
          revision: product.revision,
        });

      expect(response.status).toBe(200);
      expect(response.body.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'USED_AS_DEFAULT_MATERIAL',
            params: expect.objectContaining({
              styles: expect.arrayContaining([
                expect.objectContaining({ id: style.styleId }),
              ]),
            }),
          }),
        ]),
      );
    });

    it('lists products with pagination and filters by categoryId and status', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
        status: PublicationStatus.DRAFT,
      });
      await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
        status: PublicationStatus.DRAFT,
      });
      await createProductFixture(testApp.prisma, {
        categoryId: category.id,
        materialTypeId: materialType.id,
        status: PublicationStatus.PUBLISHED,
      });

      const pageResponse = await request(testApp.http)
        .get('/api/v1/admin/products')
        .query({ categoryId: category.id, page: 1, pageSize: 2 })
        .set('Cookie', adminCookie);

      expect(pageResponse.status).toBe(200);
      expect(pageResponse.body.items).toHaveLength(2);
      expect(pageResponse.body.page).toBe(1);
      expect(pageResponse.body.pageSize).toBe(2);
      expect(pageResponse.body.total).toBe(3);

      const draftResponse = await request(testApp.http)
        .get('/api/v1/admin/products')
        .query({
          categoryId: category.id,
          status: PublicationStatus.DRAFT,
        })
        .set('Cookie', adminCookie);

      expect(draftResponse.status).toBe(200);
      expect(draftResponse.body.items).toHaveLength(2);

      const publishedResponse = await request(testApp.http)
        .get('/api/v1/admin/products')
        .query({
          categoryId: category.id,
          status: PublicationStatus.PUBLISHED,
        })
        .set('Cookie', adminCookie);

      expect(publishedResponse.status).toBe(200);
      expect(publishedResponse.body.items).toHaveLength(1);
    });
  });

  describe('images', () => {
    it('rejects a non-image file with UNSUPPORTED_IMAGE_TYPE', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/admin/images')
        .set('Cookie', adminCookie)
        .attach('file', textDisguisedAsPngBuffer(), 'x.png');

      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe(ERROR_CODES.UNSUPPORTED_IMAGE_TYPE);
    });

    it('rejects a file over 5MB with PAYLOAD_TOO_LARGE', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/admin/images')
        .set('Cookie', adminCookie)
        .attach('file', oversizedPngBuffer(), {
          filename: 'big.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
      expect(response.body.error.params.maxBytes).toBe(MAX_IMAGE_BYTES);
    });

    it('accepts a valid small PNG', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/admin/images')
        .set('Cookie', adminCookie)
        .attach('file', validPngBuffer(), {
          filename: 'small.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(201);
      expect(typeof response.body.id).toBe('string');
      assertCloudinaryVariant(response.body.thumb, 'w_320');
      assertCloudinaryVariant(response.body.card, 'w_640');
      assertCloudinaryVariant(response.body.zoom, 'w_1600');
      assertCloudinaryVariant(response.body.texture, 'f_jpg');
      expect(typeof response.body.width).toBe('number');
      expect(typeof response.body.height).toBe('number');
    });

    it('returns IMAGE_STORAGE_FAILED and creates no row when storage fails', async () => {
      fakeCloudinary.shouldFail = true;

      try {
        const imagesBefore = await testApp.prisma.image.count();

        const response = await request(testApp.http)
          .post('/api/v1/admin/images')
          .set('Cookie', adminCookie)
          .attach('file', validPngBuffer(), {
            filename: 'small.png',
            contentType: 'image/png',
          });

        expect(response.status).toBe(502);
        expect(response.body.error.code).toBe(ERROR_CODES.IMAGE_STORAGE_FAILED);

        const imagesAfter = await testApp.prisma.image.count();
        expect(imagesAfter).toBe(imagesBefore);
      } finally {
        fakeCloudinary.shouldFail = false;
      }
    });
  });

  describe('public visibility', () => {
    it('shows a product in the public category products list right after publishing and hides it after archiving', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
        status: PublicationStatus.PUBLISHED,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const image = await createImageFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', adminCookie)
        .send(
          buildProductInput({
            categoryId: category.id,
            materialTypeId: materialType.id,
            images: [{ imageId: image.id, isPrimary: true }],
          }),
        );

      const beforePublish = await request(testApp.http).get(
        `/api/v1/public/categories/${category.id}/products`,
      );
      expect(
        beforePublish.body.items.map((item: { id: string }) => item.id),
      ).not.toContain(created.body.id);

      const published = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      const afterPublish = await request(testApp.http).get(
        `/api/v1/public/categories/${category.id}/products`,
      );
      expect(
        afterPublish.body.items.map((item: { id: string }) => item.id),
      ).toContain(created.body.id);

      await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.ARCHIVED,
          revision: published.body.revision,
        });

      const afterArchive = await request(testApp.http).get(
        `/api/v1/public/categories/${category.id}/products`,
      );
      expect(
        afterArchive.body.items.map((item: { id: string }) => item.id),
      ).not.toContain(created.body.id);
    });

    it('shows a category in public room-types right after publishing', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        surface: SurfaceKind.NONE,
        status: PublicationStatus.DRAFT,
      });
      await assignCategoryToRoomType(
        testApp.prisma,
        roomTypes.livingRoom,
        category.id,
        1,
      );

      const beforePublish = await request(testApp.http).get(
        '/api/v1/public/room-types',
      );
      const livingRoomBefore = beforePublish.body.items.find(
        (item: { id: string }) => item.id === roomTypes.livingRoom,
      );
      expect(
        livingRoomBefore.categories.map((c: { id: string }) => c.id),
      ).not.toContain(category.id);

      await request(testApp.http)
        .post(`/api/v1/admin/categories/${category.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: category.revision,
        });

      const afterPublish = await request(testApp.http).get(
        '/api/v1/public/room-types',
      );
      const livingRoomAfter = afterPublish.body.items.find(
        (item: { id: string }) => item.id === roomTypes.livingRoom,
      );
      expect(
        livingRoomAfter.categories.map((c: { id: string }) => c.id),
      ).toContain(category.id);
    });
  });
});
