import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import {
  OptionKind,
  OptionUnit,
  PublicationStatus,
  RoomTypeCode,
} from '../../src/generated/prisma/client';
import {
  type AdminCatalogRoomTypeIds,
  createAdminCatalogRoomTypes,
} from './admin-catalog-fixtures';
import {
  buildOptionInput,
  buildPackageItemInput,
} from './admin-engineering-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

function sendRequest(
  http: TestApp['http'],
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
) {
  switch (method) {
    case 'get':
      return request(http).get(path);
    case 'post':
      return request(http).post(path);
    case 'put':
      return request(http).put(path);
    case 'patch':
      return request(http).patch(path);
    case 'delete':
      return request(http).delete(path);
  }
}

const PROTECTED_ROUTES: Array<{
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
}> = [
  { method: 'get', path: '/api/v1/admin/engineering/package-items' },
  { method: 'post', path: '/api/v1/admin/engineering/package-items' },
  {
    method: 'patch',
    path: `/api/v1/admin/engineering/package-items/${RANDOM_UUID}`,
  },
  {
    method: 'post',
    path: `/api/v1/admin/engineering/package-items/${RANDOM_UUID}/status`,
  },
  { method: 'put', path: '/api/v1/admin/engineering/package-items/order' },
  {
    method: 'delete',
    path: `/api/v1/admin/engineering/package-items/${RANDOM_UUID}`,
  },
  { method: 'get', path: '/api/v1/admin/options' },
  { method: 'post', path: '/api/v1/admin/options' },
  { method: 'patch', path: `/api/v1/admin/options/${RANDOM_UUID}` },
  { method: 'post', path: `/api/v1/admin/options/${RANDOM_UUID}/status` },
  { method: 'put', path: '/api/v1/admin/options/order' },
  { method: 'delete', path: `/api/v1/admin/options/${RANDOM_UUID}` },
];

interface PublicEngineeringPackageItem {
  id: string;
  name: string;
  includedInBase: boolean;
  priceCents: number | null;
  unit: string | null;
}

interface PublicEngineeringOption {
  id: string;
  kind: string;
  name: string;
  priceCents: number;
  unit: string;
  perRoom: boolean;
  roomTypeCodes: string[];
  minQuantity: number | null;
  maxQuantity: number | null;
}

async function getPublicEngineering(http: TestApp['http']) {
  const response = await request(http)
    .get('/api/v1/public/engineering')
    .query({ lang: 'en' });
  return response.body as {
    packageItems: PublicEngineeringPackageItem[];
    options: PublicEngineeringOption[];
  };
}

describe('admin engineering e2e', () => {
  let testApp: TestApp;
  let roomTypes: AdminCatalogRoomTypeIds;
  let adminCookie: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    roomTypes = await createAdminCatalogRoomTypes(testApp.prisma);

    const admin = await createAdmin(testApp.prisma);
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

  describe('package items', () => {
    async function createPackageItem(
      overrides: Parameters<typeof buildPackageItemInput>[0] = {},
    ) {
      return request(testApp.http)
        .post('/api/v1/admin/engineering/package-items')
        .set('Cookie', adminCookie)
        .send(buildPackageItemInput(overrides));
    }

    it('rejects a non-included item without a price with PRICE_REQUIRED', async () => {
      const response = await createPackageItem({
        includedInBase: false,
        priceCents: undefined,
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.PRICE_REQUIRED);
    });

    it('creates an included item without a price in DRAFT status', async () => {
      const response = await createPackageItem({
        includedInBase: true,
        priceCents: undefined,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(PublicationStatus.DRAFT);
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.revision).toBe('string');
    });

    it('rejects a stale revision on PATCH with STALE_REVISION', async () => {
      const created = await createPackageItem();

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/engineering/package-items/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ includedInBase: true, revision: randomUUID() });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(
        created.body.revision,
      );
    });

    it('rejects publishing an item with an empty uk translation with TRANSLATION_MISSING', async () => {
      const created = await createPackageItem({
        description: { en: 'Missing translation.', uk: '' },
      });

      const response = await request(testApp.http)
        .post(
          `/api/v1/admin/engineering/package-items/${created.body.id}/status`,
        )
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.TRANSLATION_MISSING);
    });

    it(
      'shows a published included item publicly with a null price, rejects PATCHing ' +
        'it to excluded without a price, and shows the price once one is added',
      async () => {
        const created = await createPackageItem({
          includedInBase: true,
          priceCents: undefined,
        });
        expect(created.status).toBe(201);

        const published = await request(testApp.http)
          .post(
            `/api/v1/admin/engineering/package-items/${created.body.id}/status`,
          )
          .set('Cookie', adminCookie)
          .send({
            status: PublicationStatus.PUBLISHED,
            revision: created.body.revision,
          });
        expect(published.status).toBe(200);

        const beforePatch = await getPublicEngineering(testApp.http);
        const itemBeforePatch = beforePatch.packageItems.find(
          (item) => item.id === created.body.id,
        );
        expect(itemBeforePatch).toMatchObject({
          includedInBase: true,
          priceCents: null,
        });

        const patchWithoutPrice = await request(testApp.http)
          .patch(`/api/v1/admin/engineering/package-items/${created.body.id}`)
          .set('Cookie', adminCookie)
          .send({
            includedInBase: false,
            revision: published.body.revision,
          });

        expect(patchWithoutPrice.status).toBe(422);
        expect(patchWithoutPrice.body.error.code).toBe(
          ERROR_CODES.PRICE_REQUIRED,
        );

        const patchedPriceCents = 4200;
        const patchWithPrice = await request(testApp.http)
          .patch(`/api/v1/admin/engineering/package-items/${created.body.id}`)
          .set('Cookie', adminCookie)
          .send({
            includedInBase: false,
            priceCents: patchedPriceCents,
            unit: OptionUnit.PROJECT,
            revision: published.body.revision,
          });

        expect(patchWithPrice.status).toBe(200);

        const afterPatch = await getPublicEngineering(testApp.http);
        const itemAfterPatch = afterPatch.packageItems.find(
          (item) => item.id === created.body.id,
        );
        expect(itemAfterPatch).toMatchObject({
          includedInBase: false,
          priceCents: patchedPriceCents,
        });
      },
    );

    it('reorders package items via PUT and reflects the new order publicly', async () => {
      const createdA = await createPackageItem({
        name: { en: 'Order Item A', uk: 'Порядок пункт А' },
        includedInBase: true,
        priceCents: undefined,
      });
      const publishedA = await request(testApp.http)
        .post(
          `/api/v1/admin/engineering/package-items/${createdA.body.id}/status`,
        )
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: createdA.body.revision,
        });
      expect(publishedA.status).toBe(200);

      const createdB = await createPackageItem({
        name: { en: 'Order Item B', uk: 'Порядок пункт Б' },
        includedInBase: true,
        priceCents: undefined,
      });
      const publishedB = await request(testApp.http)
        .post(
          `/api/v1/admin/engineering/package-items/${createdB.body.id}/status`,
        )
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: createdB.body.revision,
        });
      expect(publishedB.status).toBe(200);

      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/engineering/package-items')
        .set('Cookie', adminCookie);
      expect(listResponse.status).toBe(200);
      const allIds: string[] = listResponse.body.items.map(
        (item: { id: string }) => item.id,
      );

      const putResponse = await request(testApp.http)
        .put('/api/v1/admin/engineering/package-items/order')
        .set('Cookie', adminCookie)
        .send({ ids: [...allIds].reverse() });

      expect(putResponse.status).toBe(204);

      const publicAfter = await getPublicEngineering(testApp.http);
      const publicIds = publicAfter.packageItems.map((item) => item.id);
      const indexA = publicIds.indexOf(createdA.body.id);
      const indexB = publicIds.indexOf(createdB.body.id);
      expect(indexB).toBeLessThan(indexA);
    });

    it('deletes a package item, removing it from the public list', async () => {
      const created = await createPackageItem({
        includedInBase: true,
        priceCents: undefined,
      });
      const published = await request(testApp.http)
        .post(
          `/api/v1/admin/engineering/package-items/${created.body.id}/status`,
        )
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const beforeDelete = await getPublicEngineering(testApp.http);
      expect(beforeDelete.packageItems.map((item) => item.id)).toContain(
        created.body.id,
      );

      const deleteResponse = await request(testApp.http)
        .delete(`/api/v1/admin/engineering/package-items/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(deleteResponse.status).toBe(204);

      const afterDelete = await getPublicEngineering(testApp.http);
      expect(afterDelete.packageItems.map((item) => item.id)).not.toContain(
        created.body.id,
      );
    });
  });

  describe('options', () => {
    async function createOption(
      overrides: Parameters<typeof buildOptionInput>[0] = {},
    ) {
      return request(testApp.http)
        .post('/api/v1/admin/options')
        .set('Cookie', adminCookie)
        .send(buildOptionInput(overrides));
    }

    it('creates an option in DRAFT status', async () => {
      const response = await createOption();

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(PublicationStatus.DRAFT);
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.revision).toBe('string');
    });

    it('rejects a PIECE option without min/max quantity with QUANTITY_BOUNDS_REQUIRED', async () => {
      const response = await createOption({
        unit: OptionUnit.PIECE,
        minQuantity: undefined,
        maxQuantity: undefined,
        roomTypeIds: [],
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(
        ERROR_CODES.QUANTITY_BOUNDS_REQUIRED,
      );
    });

    it('rejects a PROJECT option with roomTypeIds with ROOM_TYPES_NOT_ALLOWED', async () => {
      const response = await createOption({
        unit: OptionUnit.PROJECT,
        roomTypeIds: [roomTypes.bathroom],
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.ROOM_TYPES_NOT_ALLOWED);
    });

    it('rejects a PIECE option with roomTypeIds with ROOM_TYPES_NOT_ALLOWED', async () => {
      const response = await createOption({
        unit: OptionUnit.PIECE,
        minQuantity: 1,
        maxQuantity: 3,
        roomTypeIds: [roomTypes.bathroom],
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.ROOM_TYPES_NOT_ALLOWED);
    });

    it('rejects a stale revision on PATCH with STALE_REVISION', async () => {
      const created = await createOption();

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/options/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ priceCents: 2000, revision: randomUUID() });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(
        created.body.revision,
      );
    });

    it('rejects publishing an option with an empty uk translation with TRANSLATION_MISSING', async () => {
      const created = await createOption({
        description: { en: 'Missing translation.', uk: '' },
      });

      const response = await request(testApp.http)
        .post(`/api/v1/admin/options/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.TRANSLATION_MISSING);
    });

    it(
      'publishes a ROOM_SQM option restricted to BATHROOM and KITCHEN and marks it ' +
        'perRoom publicly with the matching room type codes',
      async () => {
        const created = await createOption({
          unit: OptionUnit.ROOM_SQM,
          roomTypeIds: [roomTypes.bathroom, roomTypes.kitchen],
        });
        expect(created.status).toBe(201);

        const published = await request(testApp.http)
          .post(`/api/v1/admin/options/${created.body.id}/status`)
          .set('Cookie', adminCookie)
          .send({
            status: PublicationStatus.PUBLISHED,
            revision: created.body.revision,
          });
        expect(published.status).toBe(200);

        const publicData = await getPublicEngineering(testApp.http);
        const option = publicData.options.find(
          (item) => item.id === created.body.id,
        );
        expect(option?.perRoom).toBe(true);
        expect([...(option?.roomTypeCodes ?? [])].sort()).toEqual(
          [RoomTypeCode.BATHROOM, RoomTypeCode.KITCHEN].sort(),
        );
      },
    );

    it('publishes a ROOM_SQM option with no room type restriction and shows an empty roomTypeCodes list', async () => {
      const created = await createOption({
        unit: OptionUnit.ROOM_SQM,
        roomTypeIds: [],
      });
      expect(created.status).toBe(201);

      const published = await request(testApp.http)
        .post(`/api/v1/admin/options/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const publicData = await getPublicEngineering(testApp.http);
      const option = publicData.options.find(
        (item) => item.id === created.body.id,
      );
      expect(option?.perRoom).toBe(true);
      expect(option?.roomTypeCodes).toEqual([]);
    });

    it('filters the admin options list by kind', async () => {
      const engineeringOption = await createOption({
        kind: OptionKind.ENGINEERING,
      });
      const additionalOption = await createOption({
        kind: OptionKind.ADDITIONAL,
      });

      const engineeringList = await request(testApp.http)
        .get('/api/v1/admin/options')
        .query({ kind: OptionKind.ENGINEERING })
        .set('Cookie', adminCookie);
      expect(engineeringList.status).toBe(200);
      const engineeringIds = engineeringList.body.items.map(
        (item: { id: string }) => item.id,
      );
      expect(engineeringIds).toContain(engineeringOption.body.id);
      expect(engineeringIds).not.toContain(additionalOption.body.id);

      const additionalList = await request(testApp.http)
        .get('/api/v1/admin/options')
        .query({ kind: OptionKind.ADDITIONAL })
        .set('Cookie', adminCookie);
      expect(additionalList.status).toBe(200);
      const additionalIds = additionalList.body.items.map(
        (item: { id: string }) => item.id,
      );
      expect(additionalIds).toContain(additionalOption.body.id);
      expect(additionalIds).not.toContain(engineeringOption.body.id);
    });

    it('shows an ADDITIONAL option in the same public options array with kind ADDITIONAL', async () => {
      const created = await createOption({ kind: OptionKind.ADDITIONAL });
      const published = await request(testApp.http)
        .post(`/api/v1/admin/options/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const publicData = await getPublicEngineering(testApp.http);
      const option = publicData.options.find(
        (item) => item.id === created.body.id,
      );
      expect(option?.kind).toBe(OptionKind.ADDITIONAL);
    });

    it('reorders options within a kind via PUT and reflects the new order publicly', async () => {
      const createdA = await createOption({
        kind: OptionKind.ADDITIONAL,
        name: { en: 'Order Option A', uk: 'Порядок опція А' },
      });
      const publishedA = await request(testApp.http)
        .post(`/api/v1/admin/options/${createdA.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: createdA.body.revision,
        });
      expect(publishedA.status).toBe(200);

      const createdB = await createOption({
        kind: OptionKind.ADDITIONAL,
        name: { en: 'Order Option B', uk: 'Порядок опція Б' },
      });
      const publishedB = await request(testApp.http)
        .post(`/api/v1/admin/options/${createdB.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: createdB.body.revision,
        });
      expect(publishedB.status).toBe(200);

      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/options')
        .query({ kind: OptionKind.ADDITIONAL })
        .set('Cookie', adminCookie);
      expect(listResponse.status).toBe(200);
      const allIds: string[] = listResponse.body.items.map(
        (item: { id: string }) => item.id,
      );

      const putResponse = await request(testApp.http)
        .put('/api/v1/admin/options/order')
        .set('Cookie', adminCookie)
        .send({ kind: OptionKind.ADDITIONAL, ids: [...allIds].reverse() });

      expect(putResponse.status).toBe(204);

      const publicData = await getPublicEngineering(testApp.http);
      const additionalIds = publicData.options
        .filter((option) => option.kind === OptionKind.ADDITIONAL)
        .map((option) => option.id);
      const indexA = additionalIds.indexOf(createdA.body.id);
      const indexB = additionalIds.indexOf(createdB.body.id);
      expect(indexB).toBeLessThan(indexA);
    });

    it('shows a price change publicly right after a PATCH', async () => {
      const initialPriceCents = 2500;
      const created = await createOption({ priceCents: initialPriceCents });
      const published = await request(testApp.http)
        .post(`/api/v1/admin/options/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const beforePatch = await getPublicEngineering(testApp.http);
      expect(
        beforePatch.options.find((option) => option.id === created.body.id)
          ?.priceCents,
      ).toBe(initialPriceCents);

      const updatedPriceCents = 3300;
      const patched = await request(testApp.http)
        .patch(`/api/v1/admin/options/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({
          priceCents: updatedPriceCents,
          revision: published.body.revision,
        });
      expect(patched.status).toBe(200);

      const afterPatch = await getPublicEngineering(testApp.http);
      expect(
        afterPatch.options.find((option) => option.id === created.body.id)
          ?.priceCents,
      ).toBe(updatedPriceCents);
    });

    it('deletes an option, removing it from the public list', async () => {
      const created = await createOption();
      const published = await request(testApp.http)
        .post(`/api/v1/admin/options/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const beforeDelete = await getPublicEngineering(testApp.http);
      expect(beforeDelete.options.map((option) => option.id)).toContain(
        created.body.id,
      );

      const deleteResponse = await request(testApp.http)
        .delete(`/api/v1/admin/options/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(deleteResponse.status).toBe(204);

      const afterDelete = await getPublicEngineering(testApp.http);
      expect(afterDelete.options.map((option) => option.id)).not.toContain(
        created.body.id,
      );
    });
  });
});
