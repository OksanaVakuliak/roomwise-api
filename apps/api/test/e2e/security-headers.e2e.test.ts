import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProductUnit,
  PublicationStatus,
  SurfaceKind,
} from '../../src/generated/prisma/client';
import {
  createCategoryFixture,
  createImageFixture,
  createMaterialTypeFixture,
  localizedText,
} from './admin-catalog-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const MALICIOUS_TEXT = '<script>alert(1)</script> & "quotes"';

function expectStrictSecurityHeaders(headers: Record<string, string>): void {
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['content-security-policy']).toContain("default-src 'none'");
}

describe('security headers and text integrity e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('sets strict security headers on public API responses', async () => {
    const response = await request(testApp.http).get(
      '/api/v1/public/room-types',
    );

    expect(response.status).toBe(200);
    expectStrictSecurityHeaders(
      response.headers as unknown as Record<string, string>,
    );
  });

  it('stores and returns admin-entered text verbatim in both admin and public catalog, with strict security headers', async () => {
    const category = await createCategoryFixture(testApp.prisma, {
      name: localizedText(MALICIOUS_TEXT, MALICIOUS_TEXT),
      surface: SurfaceKind.NONE,
      status: PublicationStatus.PUBLISHED,
    });
    const materialType = await createMaterialTypeFixture(testApp.prisma);
    const image = await createImageFixture(testApp.prisma);

    const created = await request(testApp.http)
      .post('/api/v1/admin/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        materialTypeId: materialType.id,
        name: localizedText(MALICIOUS_TEXT, MALICIOUS_TEXT),
        description: localizedText(MALICIOUS_TEXT, MALICIOUS_TEXT),
        brand: 'Roomwise',
        manufacturer: 'Roomwise Manufacturing',
        color: localizedText('White', 'Білий'),
        size: localizedText('1x1 m', '1x1 м'),
        priceCents: 150_000,
        confirmZeroPrice: false,
        unit: ProductUnit.PIECE,
        heatedFloorCompatible: false,
        images: [{ imageId: image.id, isPrimary: true }],
        attributes: [],
      });

    expect(created.status).toBe(201);

    const published = await request(testApp.http)
      .post(`/api/v1/admin/products/${created.body.id}/status`)
      .set('Cookie', adminCookie)
      .send({
        status: PublicationStatus.PUBLISHED,
        revision: created.body.revision,
      });

    expect(published.status).toBe(200);

    const adminGet = await request(testApp.http)
      .get(`/api/v1/admin/products/${created.body.id}`)
      .set('Cookie', adminCookie);

    expect(adminGet.status).toBe(200);
    expect(adminGet.body.name).toEqual({
      en: MALICIOUS_TEXT,
      uk: MALICIOUS_TEXT,
    });
    expect(adminGet.body.description).toEqual({
      en: MALICIOUS_TEXT,
      uk: MALICIOUS_TEXT,
    });
    expectStrictSecurityHeaders(
      adminGet.headers as unknown as Record<string, string>,
    );

    const publicGet = await request(testApp.http).get(
      `/api/v1/public/products/${created.body.id}`,
    );

    expect(publicGet.status).toBe(200);
    expect(publicGet.body.name).toBe(MALICIOUS_TEXT);
    expect(publicGet.body.description).toBe(MALICIOUS_TEXT);
    expectStrictSecurityHeaders(
      publicGet.headers as unknown as Record<string, string>,
    );
  });
});
