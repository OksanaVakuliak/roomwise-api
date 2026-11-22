import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { PublicationStatus } from '../../src/generated/prisma/client';
import {
  createCategoryFixture,
  createMaterialTypeFixture,
  createProductFixture,
  localizedText,
} from './admin-catalog-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const ADMIN_PRODUCTS = '/api/v1/admin/products';
const MAX_QUERY_LENGTH = 100;

describe('admin products search e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;
  let categoryId: string;
  let otherCategoryId: string;
  let tokens: { uk: string; en: string; brand: string };
  let ids: { laminate: string; tile: string; paint: string; published: string };

  function list(query: Record<string, string | number>) {
    return request(testApp.http)
      .get(ADMIN_PRODUCTS)
      .query(query)
      .set('Cookie', adminCookie);
  }

  function idsOf(body: { items: Array<{ id: string }> }): string[] {
    return body.items.map((item) => item.id).sort();
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);

    const suffix = randomUUID().slice(0, 8);
    tokens = {
      uk: `дуб${suffix}`,
      en: `Oak${suffix}`,
      brand: `Brand${suffix}`,
    };
    const category = await createCategoryFixture(testApp.prisma);
    const otherCategory = await createCategoryFixture(testApp.prisma);
    const materialType = await createMaterialTypeFixture(testApp.prisma);
    categoryId = category.id;
    otherCategoryId = otherCategory.id;

    const create = (
      name: { en: string; uk: string },
      overrides: {
        brand?: string;
        categoryId?: string;
        status?: PublicationStatus;
      } = {},
    ) =>
      createProductFixture(testApp.prisma, {
        categoryId,
        materialTypeId: materialType.id,
        name,
        ...overrides,
      });

    const laminate = await create(
      localizedText(`Laminate ${tokens.en}`, `Ламінат ${tokens.uk}`),
    );
    const tile = await create(localizedText('Tile', 'Плитка'), {
      brand: tokens.brand,
    });
    const paint = await create(localizedText(`Paint ${tokens.en}`, 'Фарба'), {
      categoryId: otherCategoryId,
    });
    const published = await create(
      localizedText(`Floor ${tokens.en}`, 'Підлога'),
      { status: PublicationStatus.PUBLISHED },
    );
    ids = {
      laminate: laminate.id,
      tile: tile.id,
      paint: paint.id,
      published: published.id,
    };
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('finds a product by a part of its uk name', async () => {
    const response = await list({ q: tokens.uk }).expect(200);

    expect(idsOf(response.body)).toEqual([ids.laminate]);
    expect(response.body.total).toBe(1);
  });

  it('finds products by a part of their en name', async () => {
    const response = await list({ q: tokens.en }).expect(200);

    expect(idsOf(response.body)).toEqual(
      [ids.laminate, ids.paint, ids.published].sort(),
    );
    expect(response.body.total).toBe(3);
  });

  it('finds a product by brand', async () => {
    const response = await list({ q: tokens.brand }).expect(200);

    expect(idsOf(response.body)).toEqual([ids.tile]);
  });

  it('ignores case', async () => {
    const byName = await list({ q: tokens.en.toUpperCase() }).expect(200);
    const byBrand = await list({ q: tokens.brand.toLowerCase() }).expect(200);

    expect(byName.body.total).toBe(3);
    expect(idsOf(byBrand.body)).toEqual([ids.tile]);
  });

  it('trims the term', async () => {
    const response = await list({ q: `  ${tokens.brand}  ` }).expect(200);

    expect(idsOf(response.body)).toEqual([ids.tile]);
  });

  it('treats wildcards as plain characters', async () => {
    const percent = await list({ q: '%', categoryId }).expect(200);
    const underscore = await list({ q: '_', categoryId }).expect(200);

    expect(percent.body.total).toBe(0);
    expect(underscore.body.total).toBe(0);
  });

  it('combines with the category and status filters', async () => {
    const byCategory = await list({ q: tokens.en, categoryId }).expect(200);
    const byStatus = await list({
      q: tokens.en,
      status: PublicationStatus.PUBLISHED,
    }).expect(200);

    expect(idsOf(byCategory.body)).toEqual(
      [ids.laminate, ids.published].sort(),
    );
    expect(byCategory.body.total).toBe(2);
    expect(idsOf(byStatus.body)).toEqual([ids.published]);
    expect(byStatus.body.total).toBe(1);
  });

  it('reports the filtered total across pages', async () => {
    const response = await list({ q: tokens.en, page: 2, pageSize: 2 }).expect(
      200,
    );

    expect(response.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(response.body.items).toHaveLength(1);
  });

  it('leaves the list unchanged without q', async () => {
    const response = await list({ categoryId }).expect(200);

    expect(idsOf(response.body)).toEqual(
      [ids.laminate, ids.tile, ids.published].sort(),
    );
  });

  it('answers 400 for an empty, blank or too long q', async () => {
    for (const q of ['', '   ', 'a'.repeat(MAX_QUERY_LENGTH + 1)]) {
      const response = await list({ q });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }
  });

  it('accepts q of the maximum length', async () => {
    const response = await list({ q: 'a'.repeat(MAX_QUERY_LENGTH) });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
  });
});
