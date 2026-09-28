import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { engineeringItemIds } from '../../src/modules/catalog/dataset/data/engineering';
import { materialTypeIds } from '../../src/modules/catalog/dataset/data/material-types';
import { optionIds } from '../../src/modules/catalog/dataset/data/options';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { roomTypeIds } from '../../src/modules/catalog/dataset/data/room-types';
import { styleIds } from '../../src/modules/catalog/dataset/data/styles';
import { CloudinaryService } from '../../src/modules/catalog/images/cloudinary.service';
import { CatalogCache } from '../../src/modules/catalog/public/catalog-cache';
import { createImageFixture, localizedText } from './admin-catalog-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const SEED_TIMEOUT_MS = 120_000;
const SEED_TRANSACTION_OPTIONS = { timeout: SEED_TIMEOUT_MS, maxWait: 30_000 };
const PUBLIC_ENDPOINT_MAX_MS = 2000;
const PUBLISH_VISIBILITY_MAX_MS = 60_000;
const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const PUBLIC_MUTATING_ROUTES = new Set([
  'POST /api/v1/admin/auth/login',
  'POST /api/v1/admin/auth/logout',
]);

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

interface FakeCloudinaryService {
  upload: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  deleteByPrefix: ReturnType<typeof vi.fn>;
}

function createFakeCloudinaryService(): FakeCloudinaryService {
  return {
    upload: vi.fn(),
    destroy: vi.fn(async () => {}),
    deleteByPrefix: vi.fn(async () => {}),
  };
}

async function seedCatalog(prisma: PrismaService): Promise<void> {
  await prisma.$transaction(
    (tx) => new CatalogDatasetService().upsert(catalogDataset, tx),
    SEED_TRANSACTION_OPTIONS,
  );
}

interface TimedResponse {
  response: request.Response;
  elapsedMs: number;
}

async function timedGet(
  http: TestApp['http'],
  path: string,
): Promise<TimedResponse> {
  const start = performance.now();
  const response = await request(http).get(path);
  return { response, elapsedMs: performance.now() - start };
}

function revisionedRows(
  rows: Array<{ id: string; revision: string; sortOrder?: number }>,
): string[] {
  return rows
    .map((row) =>
      row.sortOrder === undefined
        ? `${row.id}:${row.revision}`
        : `${row.id}:${row.revision}:${row.sortOrder}`,
    )
    .sort();
}

interface CatalogSnapshot {
  roomTypes: string[];
  categories: string[];
  materialTypes: string[];
  products: string[];
  styles: string[];
  engineeringItems: string[];
  options: string[];
  images: string[];
  roomTypeCategories: string[];
  productImages: string[];
  productAttributes: string[];
  styleDefaultMaterials: string[];
  optionRoomTypes: string[];
}

async function snapshotCatalogState(
  prisma: PrismaService,
): Promise<CatalogSnapshot> {
  const [
    roomTypes,
    categories,
    materialTypes,
    products,
    styles,
    engineeringItems,
    options,
    images,
    roomTypeCategories,
    productImages,
    productAttributes,
    styleDefaultMaterials,
    optionRoomTypes,
  ] = await Promise.all([
    prisma.roomType.findMany({
      select: { id: true, revision: true, sortOrder: true },
    }),
    prisma.category.findMany({ select: { id: true, revision: true } }),
    prisma.materialType.findMany({ select: { id: true, revision: true } }),
    prisma.product.findMany({ select: { id: true, revision: true } }),
    prisma.style.findMany({
      select: { id: true, revision: true, sortOrder: true },
    }),
    prisma.engineeringPackageItem.findMany({
      select: { id: true, revision: true, sortOrder: true },
    }),
    prisma.option.findMany({
      select: { id: true, revision: true, sortOrder: true },
    }),
    prisma.image.findMany({ select: { id: true } }),
    prisma.roomTypeCategory.findMany({
      select: { roomTypeId: true, categoryId: true, sortOrder: true },
    }),
    prisma.productImage.findMany({
      select: { productId: true, imageId: true },
    }),
    prisma.productAttribute.findMany({ select: { id: true } }),
    prisma.styleDefaultMaterial.findMany({
      select: {
        styleId: true,
        roomTypeId: true,
        categoryId: true,
        productId: true,
      },
    }),
    prisma.optionRoomType.findMany({
      select: { optionId: true, roomTypeId: true },
    }),
  ]);

  return {
    roomTypes: revisionedRows(roomTypes),
    categories: revisionedRows(categories),
    materialTypes: revisionedRows(materialTypes),
    products: revisionedRows(products),
    styles: revisionedRows(styles),
    engineeringItems: revisionedRows(engineeringItems),
    options: revisionedRows(options),
    images: images.map((row) => row.id).sort(),
    roomTypeCategories: roomTypeCategories
      .map((row) => `${row.roomTypeId}:${row.categoryId}:${row.sortOrder}`)
      .sort(),
    productImages: productImages
      .map((row) => `${row.productId}:${row.imageId}`)
      .sort(),
    productAttributes: productAttributes.map((row) => row.id).sort(),
    styleDefaultMaterials: styleDefaultMaterials
      .map(
        (row) =>
          `${row.styleId}:${row.roomTypeId}:${row.categoryId}:${row.productId}`,
      )
      .sort(),
    optionRoomTypes: optionRoomTypes
      .map((row) => `${row.optionId}:${row.roomTypeId}`)
      .sort(),
  };
}

interface OpenApiRoute {
  method: string;
  path: string;
}

function loadMutatingRoutes(): OpenApiRoute[] {
  const openApiPath = resolve(__dirname, '../../openapi.json');
  const document = JSON.parse(readFileSync(openApiPath, 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };

  const routes: OpenApiRoute[] = [];
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const method of Object.keys(methods)) {
      const upperMethod = method.toUpperCase();
      if (MUTATING_METHODS.includes(upperMethod)) {
        routes.push({ method: upperMethod, path });
      }
    }
  }

  return routes;
}

function resolveRouteId(path: string): string {
  if (path.startsWith('/api/v1/admin/room-types/')) {
    return roomTypeIds.livingRoom;
  }
  if (path.startsWith('/api/v1/admin/categories/')) {
    return categoryIds.doors;
  }
  if (path.startsWith('/api/v1/admin/material-types/')) {
    return materialTypeIds.parquet;
  }
  if (path.startsWith('/api/v1/admin/products/')) {
    return productIds.whiteOakParquetPlank;
  }
  if (path.startsWith('/api/v1/admin/engineering/package-items/')) {
    return engineeringItemIds.electricalWiring;
  }
  if (path.startsWith('/api/v1/admin/options/')) {
    return optionIds.heatedFloor;
  }
  if (path.startsWith('/api/v1/admin/styles/')) {
    return styleIds.scandinavian;
  }
  throw new Error(`No seeded id resolver for path: ${path}`);
}

function buildRouteUrl(path: string): string {
  if (!path.includes('{id}')) {
    return path;
  }

  return path.replace('{id}', resolveRouteId(path));
}

function sendMutation(
  http: TestApp['http'],
  method: string,
  url: string,
): request.Test {
  switch (method) {
    case 'POST':
      return request(http).post(url).send({});
    case 'PUT':
      return request(http).put(url).send({});
    case 'PATCH':
      return request(http).patch(url).send({});
    case 'DELETE':
      return request(http).delete(url).send({});
    default:
      throw new Error(`Unsupported mutating method: ${method}`);
  }
}

describe('performance e2e (SC-001, SC-003, SC-007)', () => {
  describe('SC-001: public catalog endpoints respond under 2s', () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
      await seedCatalog(testApp.prisma);
    });

    afterAll(async () => {
      await testApp.close();
    });

    const PUBLIC_ENDPOINTS = [
      { name: 'GET /public/styles', path: '/api/v1/public/styles' },
      { name: 'GET /public/room-types', path: '/api/v1/public/room-types' },
      {
        name: 'GET /public/categories/:id/products',
        path: `/api/v1/public/categories/${categoryIds.floorCovering}/products`,
      },
      {
        name: 'GET /public/products/:id',
        path: `/api/v1/public/products/${productIds.whiteOakParquetPlank}`,
      },
      {
        name: 'GET /public/styles/:id/default-materials',
        path: `/api/v1/public/styles/${styleIds.scandinavian}/default-materials`,
      },
      { name: 'GET /public/engineering', path: '/api/v1/public/engineering' },
    ];

    it.each(PUBLIC_ENDPOINTS)(
      '$name responds under 2s cold and warm',
      async ({ path }) => {
        testApp.app.get(CatalogCache).invalidate();

        const cold = await timedGet(testApp.http, path);
        expect(cold.response.status).toBe(200);
        expect(cold.elapsedMs).toBeLessThan(PUBLIC_ENDPOINT_MAX_MS);

        const warm = await timedGet(testApp.http, path);
        expect(warm.response.status).toBe(200);
        expect(warm.elapsedMs).toBeLessThan(PUBLIC_ENDPOINT_MAX_MS);
      },
    );
  });

  describe('SC-003: publishing a product becomes publicly visible immediately (well within 60s)', () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp({
        overrides: [
          {
            provide: CloudinaryService,
            useValue: createFakeCloudinaryService(),
          },
        ],
      });
      await seedCatalog(testApp.prisma);
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('invalidates the catalog cache on publish so the new product appears right away', async () => {
      const admin = await createAdmin(testApp.prisma);
      const cookie = await login(testApp.http, admin.login, admin.password);
      const image = await createImageFixture(testApp.prisma);
      const categoryPath = `/api/v1/public/categories/${categoryIds.lighting}/products`;

      const stale = await request(testApp.http).get(categoryPath);
      expect(stale.status).toBe(200);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', cookie)
        .send({
          categoryId: categoryIds.lighting,
          materialTypeId: materialTypeIds.metal,
          name: localizedText('SC-003 draft fixture', 'SC-003 чернетка'),
          description: localizedText(
            'SC-003 draft description',
            'SC-003 опис чернетки',
          ),
          brand: 'Roomwise',
          manufacturer: 'Roomwise Manufacturing',
          color: localizedText('White', 'Білий'),
          size: localizedText('1 pc', '1 шт'),
          priceCents: 2500,
          confirmZeroPrice: false,
          unit: 'PIECE',
          heatedFloorCompatible: false,
          images: [{ imageId: image.id, isPrimary: true }],
          attributes: [],
        });
      expect(created.status).toBe(201);

      const publishStart = performance.now();
      const published = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', cookie)
        .send({ status: 'PUBLISHED', revision: created.body.revision });
      expect(published.status).toBe(200);

      const afterPublish = await request(testApp.http).get(categoryPath);
      const visibleAfterMs = performance.now() - publishStart;

      expect(afterPublish.status).toBe(200);
      expect(
        afterPublish.body.items.map((item: { id: string }) => item.id),
      ).toContain(created.body.id);
      expect(visibleAfterMs).toBeLessThan(PUBLISH_VISIBILITY_MAX_MS);
    });
  });

  describe('SC-007: no unauthenticated mutation changes catalog data', () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp({
        overrides: [
          {
            provide: CloudinaryService,
            useValue: createFakeCloudinaryService(),
          },
        ],
      });
      await seedCatalog(testApp.prisma);
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('rejects every unauthenticated mutating route and leaves catalog tables unchanged', async () => {
      const routes = loadMutatingRoutes();
      expect(routes.length).toBeGreaterThanOrEqual(30);

      const before = await snapshotCatalogState(testApp.prisma);

      for (const route of routes) {
        const url = buildRouteUrl(route.path);
        const response = await sendMutation(testApp.http, route.method, url);
        const routeKey = `${route.method} ${route.path}`;

        if (PUBLIC_MUTATING_ROUTES.has(routeKey)) {
          expect(response.status, routeKey).toBeLessThan(500);
        } else {
          expect(response.status, routeKey).toBe(401);
        }
      }

      const after = await snapshotCatalogState(testApp.prisma);
      expect(after).toEqual(before);
    });

    it('does not mutate catalog data via the public-by-design login and logout routes', async () => {
      const before = await snapshotCatalogState(testApp.prisma);

      const loginResponse = await request(testApp.http)
        .post('/api/v1/admin/auth/login')
        .send({ login: 'nonexistent', password: 'wrong-password' });
      expect(loginResponse.status).toBeGreaterThanOrEqual(400);

      const logoutResponse = await request(testApp.http).post(
        '/api/v1/admin/auth/logout',
      );
      expect(logoutResponse.status).toBe(204);

      const after = await snapshotCatalogState(testApp.prisma);
      expect(after).toEqual(before);
    });

    it('rejects the maintenance run without a valid maintenance token', async () => {
      const before = await snapshotCatalogState(testApp.prisma);

      const response = await request(testApp.http).post(
        '/api/v1/internal/maintenance/run',
      );
      expect(response.status).toBe(401);

      const after = await snapshotCatalogState(testApp.prisma);
      expect(after).toEqual(before);
    });
  });
});
