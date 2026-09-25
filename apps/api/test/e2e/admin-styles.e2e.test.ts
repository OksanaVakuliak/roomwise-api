import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { PublicationStatus } from '../../src/generated/prisma/client';
import {
  type AdminCatalogRoomTypeIds,
  assignCategoryToRoomType,
  createAdminCatalogRoomTypes,
  createCategoryFixture,
  createImageFixture,
  createMaterialTypeFixture,
  createProductFixture,
  type LocalizedText,
  localizedText,
} from './admin-catalog-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

interface StylePairBody {
  roomTypeCode: string;
  roomTypeId: string;
  categoryId: string;
  categoryName: LocalizedText;
  productId: string | null;
  productName: LocalizedText | null;
  state: 'FILLED' | 'EMPTY' | 'PRODUCT_UNAVAILABLE';
}

interface StyleAdminBody {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  image: { id: string } | null;
  status: PublicationStatus;
  sortOrder: number;
  revision: string;
  pairs: StylePairBody[];
  unfilledCount: number;
  unavailableCount: number;
}

interface StyleAdminListItemBody {
  id: string;
  status: PublicationStatus;
  sortOrder: number;
  unfilledPairs: number;
  unavailablePairs: number;
}

function findPair(
  pairs: StylePairBody[],
  roomTypeId: string,
  categoryId: string,
): StylePairBody {
  const pair = pairs.find(
    (item) => item.roomTypeId === roomTypeId && item.categoryId === categoryId,
  );
  if (!pair) {
    throw new Error(
      `Missing pair for ${roomTypeId} x ${categoryId} in style pairs`,
    );
  }
  return pair;
}

function buildStyleInput(overrides: {
  name?: LocalizedText;
  description?: LocalizedText;
  imageId?: string;
}) {
  return {
    name: overrides.name ?? localizedText('Test Style', 'Тестовий стиль'),
    description:
      overrides.description ??
      localizedText('A test style.', 'Тестовий стиль.'),
    imageId: overrides.imageId,
  };
}

const PROTECTED_ROUTES: Array<{
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
}> = [
  { method: 'get', path: '/api/v1/admin/styles' },
  { method: 'get', path: `/api/v1/admin/styles/${RANDOM_UUID}` },
  { method: 'post', path: '/api/v1/admin/styles' },
  { method: 'patch', path: `/api/v1/admin/styles/${RANDOM_UUID}` },
  { method: 'put', path: '/api/v1/admin/styles/order' },
  { method: 'post', path: `/api/v1/admin/styles/${RANDOM_UUID}/status` },
  {
    method: 'put',
    path: `/api/v1/admin/styles/${RANDOM_UUID}/default-materials`,
  },
  { method: 'delete', path: `/api/v1/admin/styles/${RANDOM_UUID}` },
];

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

describe('admin styles e2e', () => {
  let testApp: TestApp;
  let roomTypes: AdminCatalogRoomTypeIds;
  let adminCookie: string;
  let flooringCategory: { id: string };
  let lightingCategory: { id: string };
  let wallsCategory: { id: string };
  let materialTypeId: string;

  beforeAll(async () => {
    testApp = await createTestApp();

    roomTypes = await createAdminCatalogRoomTypes(testApp.prisma);

    flooringCategory = await createCategoryFixture(testApp.prisma, {
      status: PublicationStatus.PUBLISHED,
    });
    lightingCategory = await createCategoryFixture(testApp.prisma, {
      status: PublicationStatus.PUBLISHED,
    });
    wallsCategory = await createCategoryFixture(testApp.prisma, {
      status: PublicationStatus.PUBLISHED,
    });

    await assignCategoryToRoomType(
      testApp.prisma,
      roomTypes.livingRoom,
      flooringCategory.id,
      1,
    );
    await assignCategoryToRoomType(
      testApp.prisma,
      roomTypes.livingRoom,
      lightingCategory.id,
      2,
    );
    await assignCategoryToRoomType(
      testApp.prisma,
      roomTypes.bedroom,
      flooringCategory.id,
      1,
    );

    const materialType = await createMaterialTypeFixture(testApp.prisma);
    materialTypeId = materialType.id;

    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);
  });

  afterAll(async () => {
    await testApp.close();
  });

  async function createPublishedProduct(categoryId: string) {
    return createProductFixture(testApp.prisma, {
      categoryId,
      materialTypeId,
      status: PublicationStatus.PUBLISHED,
    });
  }

  async function createStyle(
    overrides: {
      name?: LocalizedText;
      description?: LocalizedText;
      imageId?: string;
    } = {},
  ) {
    return request(testApp.http)
      .post('/api/v1/admin/styles')
      .set('Cookie', adminCookie)
      .send(buildStyleInput(overrides));
  }

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

  describe('create, read, update, delete', () => {
    it('creates a style in DRAFT status', async () => {
      const response = await createStyle();

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(PublicationStatus.DRAFT);
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.revision).toBe('string');
    });

    it('rejects creating a style with invalid input with 400', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/admin/styles')
        .set('Cookie', adminCookie)
        .send({ name: { en: 'Only EN' } });

      expect(response.status).toBe(400);
    });

    it('returns NOT_FOUND for a nonexistent style', async () => {
      const response = await request(testApp.http)
        .get(`/api/v1/admin/styles/${RANDOM_UUID}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('returns every room-type x category pair as EMPTY for a new style', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .get(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(200);
      const body: StyleAdminBody = response.body;
      expect(body.pairs).toHaveLength(3);
      expect(body.pairs.every((pair) => pair.state === 'EMPTY')).toBe(true);
      expect(body.unfilledCount).toBe(3);
      expect(body.unavailableCount).toBe(0);
    });

    it('updates a style via PATCH and returns a new revision', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({
          name: localizedText('Renamed Style', 'Перейменований стиль'),
          revision: created.body.revision,
        });

      expect(response.status).toBe(200);
      expect(response.body.revision).not.toBe(created.body.revision);
    });

    it('rejects a stale revision on PATCH with STALE_REVISION', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({
          name: localizedText('Stale', 'Застарілий'),
          revision: randomUUID(),
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(
        created.body.revision,
      );
    });

    it('deletes a style', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .delete(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(204);

      const getResponse = await request(testApp.http)
        .get(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(getResponse.status).toBe(404);
      expect(getResponse.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('returns 404 on the second delete of the same style', async () => {
      const created = await createStyle();

      const first = await request(testApp.http)
        .delete(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);
      expect(first.status).toBe(204);

      const second = await request(testApp.http)
        .delete(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(second.status).toBe(404);
      expect(second.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  describe('publishing', () => {
    it('rejects publishing a style without an image with STYLE_IMAGE_MISSING', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.STYLE_IMAGE_MISSING);
    });

    it('rejects publishing a style with a missing translation with TRANSLATION_MISSING', async () => {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({
        description: { en: 'Missing translation.', uk: '' },
        imageId: image.id,
      });

      const response = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.TRANSLATION_MISSING);
      expect(response.body.error.params.fields).toEqual(
        expect.arrayContaining([expect.stringContaining('description')]),
      );
    });

    it('publishes a style with an image and full translations', async () => {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({ imageId: image.id });

      const response = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(PublicationStatus.PUBLISHED);
    });

    it('rejects a stale revision on PATCH of a published style with STALE_REVISION, not STYLE_IMAGE_MISSING', async () => {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({ imageId: image.id });

      const published = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ imageId: null, revision: randomUUID() });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(
        published.body.revision,
      );
    });

    it('rejects clearing the image of a published style via PATCH with STYLE_IMAGE_MISSING', async () => {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({ imageId: image.id });

      const published = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      expect(published.status).toBe(200);

      const response = await request(testApp.http)
        .patch(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ imageId: null, revision: published.body.revision });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.STYLE_IMAGE_MISSING);
    });
  });

  describe('default materials', () => {
    it('rejects a default product from another category with PRODUCT_CATEGORY_MISMATCH and writes nothing', async () => {
      const created = await createStyle();
      const wallsProduct = await createPublishedProduct(wallsCategory.id);

      const response = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.livingRoom,
              categoryId: flooringCategory.id,
              productId: wallsProduct.id,
            },
          ],
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(
        ERROR_CODES.PRODUCT_CATEGORY_MISMATCH,
      );

      const getResponse = await request(testApp.http)
        .get(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);
      const pair = findPair(
        getResponse.body.pairs,
        roomTypes.livingRoom,
        flooringCategory.id,
      );
      expect(pair.state).toBe('EMPTY');
      expect(getResponse.body.revision).toBe(created.body.revision);
    });

    it('rejects an unknown productId with PRODUCT_NOT_FOUND', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.livingRoom,
              categoryId: flooringCategory.id,
              productId: RANDOM_UUID,
            },
          ],
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.PRODUCT_NOT_FOUND);
      expect(response.body.error.params.productIds).toEqual([RANDOM_UUID]);
    });

    it('rejects a pair not in the room type set with PAIR_NOT_IN_ROOM_TYPE', async () => {
      const created = await createStyle();
      const lightingProduct = await createPublishedProduct(lightingCategory.id);

      const response = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.bedroom,
              categoryId: lightingCategory.id,
              productId: lightingProduct.id,
            },
          ],
          revision: created.body.revision,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.PAIR_NOT_IN_ROOM_TYPE);
    });

    it('rejects a stale revision on default-materials with STALE_REVISION', async () => {
      const created = await createStyle();

      const response = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({ items: [], revision: randomUUID() });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
    });

    it('fills one pair, reports unfilledCount for the rest, allows publishing, and lists unfilledPairs', async () => {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({ imageId: image.id });
      const flooringProduct = await createPublishedProduct(flooringCategory.id);

      const filled = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.livingRoom,
              categoryId: flooringCategory.id,
              productId: flooringProduct.id,
            },
          ],
          revision: created.body.revision,
        });

      expect(filled.status).toBe(200);
      const filledBody: StyleAdminBody = filled.body;
      expect(
        findPair(filledBody.pairs, roomTypes.livingRoom, flooringCategory.id)
          .state,
      ).toBe('FILLED');
      expect(
        findPair(filledBody.pairs, roomTypes.livingRoom, lightingCategory.id)
          .state,
      ).toBe('EMPTY');
      expect(
        findPair(filledBody.pairs, roomTypes.bedroom, flooringCategory.id)
          .state,
      ).toBe('EMPTY');
      expect(filledBody.unfilledCount).toBe(2);

      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/styles')
        .set('Cookie', adminCookie);
      const listItem: StyleAdminListItemBody = listResponse.body.items.find(
        (item: StyleAdminListItemBody) => item.id === created.body.id,
      );
      expect(listItem.unfilledPairs).toBe(2);
      expect(listItem.unavailablePairs).toBe(0);

      const publishResponse = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: filledBody.revision,
        });

      expect(publishResponse.status).toBe(200);
      expect(publishResponse.body.status).toBe(PublicationStatus.PUBLISHED);
    });

    it('clears a pair when productId is set to null', async () => {
      const created = await createStyle();
      const flooringProduct = await createPublishedProduct(flooringCategory.id);

      const filled = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.livingRoom,
              categoryId: flooringCategory.id,
              productId: flooringProduct.id,
            },
          ],
          revision: created.body.revision,
        });

      const cleared = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.livingRoom,
              categoryId: flooringCategory.id,
              productId: null,
            },
          ],
          revision: filled.body.revision,
        });

      expect(cleared.status).toBe(200);
      const pair = findPair(
        cleared.body.pairs,
        roomTypes.livingRoom,
        flooringCategory.id,
      );
      expect(pair.state).toBe('EMPTY');
      expect(pair.productId).toBeNull();
    });
  });

  describe('product availability', () => {
    it('shows PRODUCT_UNAVAILABLE and unavailableCount after the default product is archived, and nulls it out publicly', async () => {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({ imageId: image.id });
      const flooringProduct = await createPublishedProduct(flooringCategory.id);

      const filled = await request(testApp.http)
        .put(`/api/v1/admin/styles/${created.body.id}/default-materials`)
        .set('Cookie', adminCookie)
        .send({
          items: [
            {
              roomTypeId: roomTypes.livingRoom,
              categoryId: flooringCategory.id,
              productId: flooringProduct.id,
            },
          ],
          revision: created.body.revision,
        });

      const published = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: filled.body.revision,
        });

      await request(testApp.http)
        .post(`/api/v1/admin/products/${flooringProduct.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.ARCHIVED,
          revision: flooringProduct.revision,
        });

      const afterArchive = await request(testApp.http)
        .get(`/api/v1/admin/styles/${created.body.id}`)
        .set('Cookie', adminCookie);

      expect(afterArchive.status).toBe(200);
      const pair = findPair(
        afterArchive.body.pairs,
        roomTypes.livingRoom,
        flooringCategory.id,
      );
      expect(pair.state).toBe('PRODUCT_UNAVAILABLE');
      expect(afterArchive.body.unavailableCount).toBe(1);

      const publicResponse = await request(testApp.http).get(
        `/api/v1/public/styles/${published.body.id}/default-materials`,
      );
      const publicItem = publicResponse.body.items.find(
        (item: { roomTypeCode: string; categoryId: string }) =>
          item.roomTypeCode === 'LIVING_ROOM' &&
          item.categoryId === flooringCategory.id,
      );
      expect(publicItem.productId).toBeNull();
    });
  });

  describe('order', () => {
    async function createPublishedStyle(name: LocalizedText) {
      const image = await createImageFixture(testApp.prisma);
      const created = await createStyle({ name, imageId: image.id });
      const published = await request(testApp.http)
        .post(`/api/v1/admin/styles/${created.body.id}/status`)
        .set('Cookie', adminCookie)
        .send({
          status: PublicationStatus.PUBLISHED,
          revision: created.body.revision,
        });
      return published.body as StyleAdminBody;
    }

    it('reorders styles via PUT and reflects the reversal in public GET, invalidating the cache', async () => {
      const styleA = await createPublishedStyle(
        localizedText('Order Alpha', 'Порядок Альфа'),
      );
      const styleB = await createPublishedStyle(
        localizedText('Order Beta', 'Порядок Бета'),
      );

      const listBefore = await request(testApp.http)
        .get('/api/v1/admin/styles')
        .set('Cookie', adminCookie);
      expect(listBefore.status).toBe(200);
      const allIds: string[] = listBefore.body.items.map(
        (item: { id: string }) => item.id,
      );
      const reversedIds = [...allIds].reverse();

      const putResponse = await request(testApp.http)
        .put('/api/v1/admin/styles/order')
        .set('Cookie', adminCookie)
        .send({ styleIds: reversedIds });

      expect(putResponse.status).toBe(204);

      const publicResponse = await request(testApp.http).get(
        '/api/v1/public/styles',
      );
      const publicIds: string[] = publicResponse.body.items.map(
        (item: { id: string }) => item.id,
      );
      const indexA = publicIds.indexOf(styleA.id);
      const indexB = publicIds.indexOf(styleB.id);
      expect(indexB).toBeLessThan(indexA);
    });

    it('keeps a revision fetched before reorder valid for a later PATCH', async () => {
      const styleA = await createPublishedStyle(
        localizedText('Revision Alpha', 'Ревізія Альфа'),
      );

      const listBefore = await request(testApp.http)
        .get('/api/v1/admin/styles')
        .set('Cookie', adminCookie);
      const allIds: string[] = listBefore.body.items.map(
        (item: { id: string }) => item.id,
      );

      const reorderResponse = await request(testApp.http)
        .put('/api/v1/admin/styles/order')
        .set('Cookie', adminCookie)
        .send({ styleIds: [...allIds].reverse() });
      expect(reorderResponse.status).toBe(204);

      const patchResponse = await request(testApp.http)
        .patch(`/api/v1/admin/styles/${styleA.id}`)
        .set('Cookie', adminCookie)
        .send({
          name: localizedText('Revision Alpha 2', 'Ревізія Альфа 2'),
          revision: styleA.revision,
        });

      expect(patchResponse.status).toBe(200);
    });

    it('rejects an order list missing a style with STYLE_SET_MISMATCH', async () => {
      const listResponse = await request(testApp.http)
        .get('/api/v1/admin/styles')
        .set('Cookie', adminCookie);
      expect(listResponse.status).toBe(200);
      const allIds: string[] = listResponse.body.items.map(
        (item: { id: string }) => item.id,
      );
      const incompleteIds = allIds.slice(1);

      const response = await request(testApp.http)
        .put('/api/v1/admin/styles/order')
        .set('Cookie', adminCookie)
        .send({ styleIds: incompleteIds });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.STYLE_SET_MISMATCH);
    });
  });
});
