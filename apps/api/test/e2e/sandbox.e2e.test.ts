import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedDemoAdmin } from '../../prisma/seed/admins';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  DEMO_UPLOADS_PER_HOUR,
  DEMO_WRITES_PER_HOUR,
} from '../../src/common/throttling/demo-throttle.constants';
import {
  PublicationStatus,
  SurfaceKind,
} from '../../src/generated/prisma/client';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { optionIds } from '../../src/modules/catalog/dataset/data/options';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { styleIds } from '../../src/modules/catalog/dataset/data/styles';
import { CloudinaryService } from '../../src/modules/catalog/images/cloudinary.service';
import { CLOUDINARY_UPLOAD_FOLDER } from '../../src/modules/catalog/images/images.constants';
import { CatalogCache } from '../../src/modules/catalog/public/catalog-cache';
import {
  catalogParticipant,
  SANDBOX_DATASET_PARTICIPANTS,
  type SandboxDatasetParticipant,
} from '../../src/modules/sandbox/sandbox-dataset-participant';
import {
  createCategoryFixture,
  createImageFixture,
  createMaterialTypeFixture,
  localizedText,
  validPngBuffer,
} from './admin-catalog-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const SEED_TIMEOUT_MS = 120_000;
const SEED_TRANSACTION_OPTIONS = { timeout: SEED_TIMEOUT_MS, maxWait: 30_000 };
const MAINTENANCE_TOKEN_HEADER = 'x-maintenance-token';
const DEMO_LOGIN = process.env.DEMO_ADMIN_LOGIN as string;
const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD as string;
const MAINTENANCE_TOKEN = process.env.MAINTENANCE_TOKEN as string;
const PAST_DATE = new Date('2020-01-01T00:00:00.000Z');
const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

interface FakeCloudinaryService {
  upload: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  deleteByPrefix: ReturnType<typeof vi.fn>;
}

function createFakeCloudinaryService(): FakeCloudinaryService {
  return {
    upload: vi.fn(async (buffer: Buffer) => ({
      publicId: `${CLOUDINARY_UPLOAD_FOLDER}/fake-${randomUUID()}`,
      width: 1,
      height: 1,
      format: 'png',
      bytes: buffer.length,
    })),
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

async function runMaintenance(
  http: TestApp['http'],
): Promise<{ tasks: { name: string; status: string }[] }> {
  const response = await request(http)
    .post('/api/v1/internal/maintenance/run')
    .set(MAINTENANCE_TOKEN_HEADER, MAINTENANCE_TOKEN);

  expect(response.status).toBe(200);

  return response.body;
}

async function forceResetDue(prisma: PrismaService): Promise<void> {
  await prisma.sandboxState.update({
    where: { id: 1 },
    data: { nextResetAt: PAST_DATE },
  });
}

describe('sandbox e2e (US6)', () => {
  describe('me — demo sandbox info (scenario 1)', () => {
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
      await seedDemoAdmin(testApp.prisma, {
        login: DEMO_LOGIN,
        password: DEMO_PASSWORD,
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('reports isDemo, sandbox reset time and demoLimits for the demo admin', async () => {
      const cookie = await login(testApp.http, DEMO_LOGIN, DEMO_PASSWORD);

      const response = await request(testApp.http)
        .get('/api/v1/admin/auth/me')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.isDemo).toBe(true);
      expect(typeof response.body.sandbox.nextResetAt).toBe('string');
      expect(new Date(response.body.sandbox.nextResetAt).toString()).not.toBe(
        'Invalid Date',
      );
      expect(response.body.sandbox.resetTime).toBe(
        process.env.SANDBOX_RESET_TIME,
      );
      expect(response.body.sandbox.timezone).toBe(process.env.SANDBOX_TIMEZONE);
      expect(response.body.demoLimits).toEqual({
        writesPerHour: DEMO_WRITES_PER_HOUR,
        uploadsPerHour: DEMO_UPLOADS_PER_HOUR,
      });
    });

    it('reports null sandbox and demoLimits for a regular admin', async () => {
      const admin = await createAdmin(testApp.prisma);
      const cookie = await login(testApp.http, admin.login, admin.password);

      const response = await request(testApp.http)
        .get('/api/v1/admin/auth/me')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.isDemo).toBe(false);
      expect(response.body.sandbox).toBeNull();
      expect(response.body.demoLimits).toBeNull();
    });
  });

  describe('demo admin restrictions (scenario 2)', () => {
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
      await seedDemoAdmin(testApp.prisma, {
        login: DEMO_LOGIN,
        password: DEMO_PASSWORD,
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('forbids the demo admin from changing their password', async () => {
      const cookie = await login(testApp.http, DEMO_LOGIN, DEMO_PASSWORD);

      const response = await request(testApp.http)
        .post('/api/v1/admin/auth/password')
        .set('Cookie', cookie)
        .send({
          currentPassword: DEMO_PASSWORD,
          newPassword: 'Some-New-Passw0rd!',
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: {
          code: ERROR_CODES.DEMO_FORBIDDEN,
          params: { action: 'change-password' },
        },
      });
    });
  });

  describe('sandbox reset (scenario 3, SC-008)', () => {
    let testApp: TestApp;
    let fakeCloudinary: FakeCloudinaryService;
    let cookie: string;

    beforeAll(async () => {
      fakeCloudinary = createFakeCloudinaryService();
      testApp = await createTestApp({
        overrides: [{ provide: CloudinaryService, useValue: fakeCloudinary }],
      });

      await seedCatalog(testApp.prisma);
      await seedDemoAdmin(testApp.prisma, {
        login: DEMO_LOGIN,
        password: DEMO_PASSWORD,
      });
      cookie = await login(testApp.http, DEMO_LOGIN, DEMO_PASSWORD);
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('restores edited catalog data, keeps admins and sessions intact, and rejects the stale revision afterwards', async () => {
      const adminsBefore = await testApp.prisma.admin.findMany({
        orderBy: { id: 'asc' },
      });
      const sessionsBefore = await testApp.prisma.adminSession.findMany({
        orderBy: { id: 'asc' },
      });

      const productGet = await request(testApp.http)
        .get(`/api/v1/admin/products/${productIds.whiteOakParquetPlank}`)
        .set('Cookie', cookie);
      const styleGet = await request(testApp.http)
        .get(`/api/v1/admin/styles/${styleIds.scandinavian}`)
        .set('Cookie', cookie);
      const optionGet = await request(testApp.http)
        .get(`/api/v1/admin/options/${optionIds.heatedFloor}`)
        .set('Cookie', cookie);

      const productPatch = await request(testApp.http)
        .patch(`/api/v1/admin/products/${productIds.whiteOakParquetPlank}`)
        .set('Cookie', cookie)
        .send({
          name: localizedText('Edited product', 'Змінений товар'),
          revision: productGet.body.revision,
        });
      expect(productPatch.status).toBe(200);

      const stylePatch = await request(testApp.http)
        .patch(`/api/v1/admin/styles/${styleIds.scandinavian}`)
        .set('Cookie', cookie)
        .send({
          name: localizedText('Edited style', 'Змінений стиль'),
          revision: styleGet.body.revision,
        });
      expect(stylePatch.status).toBe(200);

      const optionPatch = await request(testApp.http)
        .patch(`/api/v1/admin/options/${optionIds.heatedFloor}`)
        .set('Cookie', cookie)
        .send({
          name: localizedText('Edited option', 'Змінена опція'),
          revision: optionGet.body.revision,
        });
      expect(optionPatch.status).toBe(200);
      const staleOptionRevision = optionPatch.body.revision as string;

      await forceResetDue(testApp.prisma);
      const maintenanceResult = await runMaintenance(testApp.http);

      expect(maintenanceResult).toEqual({
        tasks: [{ name: 'sandbox-reset', status: 'SUCCESS' }],
      });

      const productAfter = await request(testApp.http)
        .get(`/api/v1/admin/products/${productIds.whiteOakParquetPlank}`)
        .set('Cookie', cookie);
      const styleAfter = await request(testApp.http)
        .get(`/api/v1/admin/styles/${styleIds.scandinavian}`)
        .set('Cookie', cookie);
      const optionAfter = await request(testApp.http)
        .get(`/api/v1/admin/options/${optionIds.heatedFloor}`)
        .set('Cookie', cookie);

      const datasetProduct = catalogDataset.products.find(
        (product) => product.id === productIds.whiteOakParquetPlank,
      );
      const datasetStyle = catalogDataset.styles.find(
        (style) => style.id === styleIds.scandinavian,
      );
      const datasetOption = catalogDataset.options.find(
        (option) => option.id === optionIds.heatedFloor,
      );

      expect(productAfter.body.name).toEqual(datasetProduct?.name);
      expect(styleAfter.body.name).toEqual(datasetStyle?.name);
      expect(optionAfter.body.name).toEqual(datasetOption?.name);

      const adminsAfter = await testApp.prisma.admin.findMany({
        orderBy: { id: 'asc' },
      });
      const sessionsAfter = await testApp.prisma.adminSession.findMany({
        orderBy: { id: 'asc' },
      });
      expect(adminsAfter).toEqual(adminsBefore);
      expect(sessionsAfter).toEqual(sessionsBefore);

      const sandboxState = await testApp.prisma.sandboxState.findUniqueOrThrow({
        where: { id: 1 },
      });
      expect(sandboxState.lastResetStatus).toBe('SUCCESS');
      expect(sandboxState.nextResetAt.getTime()).toBeGreaterThan(Date.now());

      expect(fakeCloudinary.deleteByPrefix).toHaveBeenCalledWith(
        `${CLOUDINARY_UPLOAD_FOLDER}/`,
      );

      const staleRevisionResponse = await request(testApp.http)
        .patch(`/api/v1/admin/options/${optionIds.heatedFloor}`)
        .set('Cookie', cookie)
        .send({
          name: localizedText('Late edit', 'Пізня зміна'),
          revision: staleOptionRevision,
        });

      expect(staleRevisionResponse.status).toBe(409);
      expect(staleRevisionResponse.body.error.code).toBe(
        ERROR_CODES.STALE_REVISION,
      );
    });
  });

  describe('sandbox reset failure (scenario 6)', () => {
    it('rolls back every participant when one of them fails', async () => {
      const fakeCloudinary = createFakeCloudinaryService();
      const brokenParticipant: SandboxDatasetParticipant = {
        name: 'broken',
        replace: async () => {
          throw new Error('boom');
        },
      };

      const testApp = await createTestApp({
        overrides: [
          { provide: CloudinaryService, useValue: fakeCloudinary },
          {
            provide: SANDBOX_DATASET_PARTICIPANTS,
            useFactory: (
              datasetService: CatalogDatasetService,
              cache: CatalogCache,
              cloudinary: CloudinaryService,
            ) => [
              catalogParticipant(datasetService, cache, cloudinary),
              brokenParticipant,
            ],
            inject: [CatalogDatasetService, CatalogCache, CloudinaryService],
          },
        ],
      });

      try {
        await seedCatalog(testApp.prisma);

        const modifiedName = localizedText(
          'Modified before failed reset',
          'Змінено перед невдалим скиданням',
        );
        await testApp.prisma.product.update({
          where: { id: productIds.whiteOakParquetPlank },
          data: { name: modifiedName },
        });

        await forceResetDue(testApp.prisma);
        const maintenanceResult = await runMaintenance(testApp.http);

        expect(maintenanceResult).toEqual({
          tasks: [{ name: 'sandbox-reset', status: 'FAILED' }],
        });

        const product = await testApp.prisma.product.findUniqueOrThrow({
          where: { id: productIds.whiteOakParquetPlank },
        });
        expect(product.name).toEqual(modifiedName);

        const sandboxState =
          await testApp.prisma.sandboxState.findUniqueOrThrow({
            where: { id: 1 },
          });
        expect(sandboxState.lastResetStatus).toBe('FAILED');
        expect(sandboxState.lockedAt).toBeNull();
        expect(fakeCloudinary.deleteByPrefix).not.toHaveBeenCalled();
      } finally {
        await testApp.close();
      }
    });
  });

  describe('demo write rate limiting (scenario 4)', () => {
    it('rate limits the 61st mutation from a demo admin within the hour', async () => {
      const testApp = await createTestApp({
        overrides: [
          {
            provide: CloudinaryService,
            useValue: createFakeCloudinaryService(),
          },
        ],
      });

      try {
        await seedDemoAdmin(testApp.prisma, {
          login: DEMO_LOGIN,
          password: DEMO_PASSWORD,
        });
        const cookie = await login(testApp.http, DEMO_LOGIN, DEMO_PASSWORD);

        for (let attempt = 0; attempt < DEMO_WRITES_PER_HOUR; attempt += 1) {
          const response = await request(testApp.http)
            .delete(`/api/v1/admin/options/${RANDOM_UUID}`)
            .set('Cookie', cookie);

          expect(response.status).not.toBe(429);
        }

        const limitedResponse = await request(testApp.http)
          .delete(`/api/v1/admin/options/${RANDOM_UUID}`)
          .set('Cookie', cookie);

        expect(limitedResponse.status).toBe(429);
        expect(limitedResponse.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
        expect(limitedResponse.headers['retry-after']).toBeDefined();
      } finally {
        await testApp.close();
      }
    });

    it('does not rate limit a regular admin after 61 mutations', async () => {
      const testApp = await createTestApp({
        overrides: [
          {
            provide: CloudinaryService,
            useValue: createFakeCloudinaryService(),
          },
        ],
      });

      try {
        const admin = await createAdmin(testApp.prisma);
        const cookie = await login(testApp.http, admin.login, admin.password);

        for (
          let attempt = 0;
          attempt < DEMO_WRITES_PER_HOUR + 1;
          attempt += 1
        ) {
          const response = await request(testApp.http)
            .delete(`/api/v1/admin/options/${RANDOM_UUID}`)
            .set('Cookie', cookie);

          expect(response.status).not.toBe(429);
        }
      } finally {
        await testApp.close();
      }
    });

    it('rate limits the 11th image upload from a demo admin within the hour', async () => {
      const fakeCloudinary = createFakeCloudinaryService();
      const testApp = await createTestApp({
        overrides: [{ provide: CloudinaryService, useValue: fakeCloudinary }],
      });

      try {
        await seedDemoAdmin(testApp.prisma, {
          login: DEMO_LOGIN,
          password: DEMO_PASSWORD,
        });
        const cookie = await login(testApp.http, DEMO_LOGIN, DEMO_PASSWORD);

        for (let attempt = 0; attempt < DEMO_UPLOADS_PER_HOUR; attempt += 1) {
          const response = await request(testApp.http)
            .post('/api/v1/admin/images')
            .set('Cookie', cookie)
            .attach('file', validPngBuffer(), {
              filename: `image-${attempt}.png`,
              contentType: 'image/png',
            });

          expect(response.status).toBe(201);
        }

        const limitedResponse = await request(testApp.http)
          .post('/api/v1/admin/images')
          .set('Cookie', cookie)
          .attach('file', validPngBuffer(), {
            filename: 'image-overflow.png',
            contentType: 'image/png',
          });

        expect(limitedResponse.status).toBe(429);
        expect(limitedResponse.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
      } finally {
        await testApp.close();
      }
    });
  });

  describe('markup verbatim in the demo sandbox (scenario 5)', () => {
    let testApp: TestApp;
    let cookie: string;

    const MALICIOUS_TEXT = '<b>x</b><script>alert(1)</script>';

    beforeAll(async () => {
      testApp = await createTestApp({
        overrides: [
          {
            provide: CloudinaryService,
            useValue: createFakeCloudinaryService(),
          },
        ],
      });
      await seedDemoAdmin(testApp.prisma, {
        login: DEMO_LOGIN,
        password: DEMO_PASSWORD,
      });
      cookie = await login(testApp.http, DEMO_LOGIN, DEMO_PASSWORD);
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('stores and returns markup in a product name verbatim from admin and public APIs', async () => {
      const category = await createCategoryFixture(testApp.prisma, {
        name: localizedText(MALICIOUS_TEXT, MALICIOUS_TEXT),
        surface: SurfaceKind.NONE,
        status: PublicationStatus.PUBLISHED,
      });
      const materialType = await createMaterialTypeFixture(testApp.prisma);
      const image = await createImageFixture(testApp.prisma);

      const created = await request(testApp.http)
        .post('/api/v1/admin/products')
        .set('Cookie', cookie)
        .send({
          categoryId: category.id,
          materialTypeId: materialType.id,
          name: localizedText(MALICIOUS_TEXT, MALICIOUS_TEXT),
          description: localizedText('desc', 'опис'),
          brand: 'Roomwise',
          manufacturer: 'Roomwise Manufacturing',
          color: localizedText('White', 'Білий'),
          size: localizedText('1x1 m', '1x1 м'),
          priceCents: 1000,
          confirmZeroPrice: false,
          unit: 'PIECE',
          heatedFloorCompatible: false,
          images: [{ imageId: image.id, isPrimary: true }],
          attributes: [],
        });

      expect(created.status).toBe(201);
      expect(created.body.name).toEqual({
        en: MALICIOUS_TEXT,
        uk: MALICIOUS_TEXT,
      });

      const published = await request(testApp.http)
        .post(`/api/v1/admin/products/${created.body.id}/status`)
        .set('Cookie', cookie)
        .send({ status: 'PUBLISHED', revision: created.body.revision });
      expect(published.status).toBe(200);

      const publicGet = await request(testApp.http).get(
        `/api/v1/public/products/${created.body.id}`,
      );

      expect(publicGet.status).toBe(200);
      expect(publicGet.body.name).toBe(MALICIOUS_TEXT);
    });
  });
});
