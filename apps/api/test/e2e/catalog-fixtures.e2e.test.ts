import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './app-factory';
import { createCatalogFixtures } from './catalog-fixtures';

describe('createCatalogFixtures', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('inserts a full published catalog set without constraint errors', async () => {
    const fixtures = await createCatalogFixtures(testApp.prisma);

    expect(fixtures.roomTypeId).toBeTruthy();
    expect(fixtures.categoryId).toBeTruthy();
    expect(fixtures.materialTypeId).toBeTruthy();
    expect(fixtures.imageId).toBeTruthy();
    expect(fixtures.productId).toBeTruthy();
    expect(fixtures.styleId).toBeTruthy();

    const product = await testApp.prisma.product.findUniqueOrThrow({
      where: { id: fixtures.productId },
    });

    expect(product.categoryId).toBe(fixtures.categoryId);
    expect(product.materialTypeId).toBe(fixtures.materialTypeId);
  });
});
