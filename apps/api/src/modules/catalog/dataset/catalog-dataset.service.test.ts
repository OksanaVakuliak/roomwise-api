import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client';
import {
  buildCatalogDatasetRows,
  CatalogDatasetService,
  deriveProductAttributeId,
} from './catalog-dataset.service';
import { catalogDataset } from './data';

const UUID_V5_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const MODELS = [
  'image',
  'roomType',
  'roomTypeCategory',
  'materialType',
  'category',
  'product',
  'productImage',
  'productAttribute',
  'style',
  'styleDefaultMaterial',
  'engineeringPackageItem',
  'option',
  'optionRoomType',
  'admin',
  'adminSession',
] as const;

const OPERATIONS = [
  'upsert',
  'createMany',
  'deleteMany',
  'updateMany',
  'aggregate',
] as const;

interface RecordedCall {
  model: string;
  operation: string;
  args: unknown;
}

function createTx(maxSortOrder: number | null = null) {
  const calls: RecordedCall[] = [];
  const tx: Record<string, Record<string, unknown>> = {};

  for (const model of MODELS) {
    tx[model] = {};
    for (const operation of OPERATIONS) {
      tx[model][operation] = vi.fn(async (args: unknown) => {
        calls.push({ model, operation, args });
        if (operation === 'aggregate') {
          return { _max: { sortOrder: maxSortOrder } };
        }
        return { count: 0 };
      });
    }
  }

  const steps = () => calls.map((call) => `${call.model}.${call.operation}`);
  const argsOf = (model: string, operation: string) =>
    calls
      .filter((call) => call.model === model && call.operation === operation)
      .map((call) => call.args);

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    calls,
    steps,
    argsOf,
  };
}

function firstIndex(steps: string[], step: string): number {
  const index = steps.indexOf(step);
  expect(index, step).toBeGreaterThanOrEqual(0);
  return index;
}

function lastIndex(steps: string[], step: string): number {
  const index = steps.lastIndexOf(step);
  expect(index, step).toBeGreaterThanOrEqual(0);
  return index;
}

describe('buildCatalogDatasetRows', () => {
  it('orders room type categories by their position in the dataset', () => {
    const rows = buildCatalogDatasetRows(catalogDataset);
    const roomType = catalogDataset.roomTypes[0];

    const links = rows.roomTypeCategories.filter(
      (row) => row.roomTypeId === roomType.id,
    );

    expect(links).toEqual(
      roomType.categoryIds.map((categoryId, sortOrder) => ({
        roomTypeId: roomType.id,
        categoryId,
        sortOrder,
      })),
    );
  });

  it('gives product attributes stable unique ids', () => {
    const first = buildCatalogDatasetRows(catalogDataset).productAttributes;
    const second = buildCatalogDatasetRows(catalogDataset).productAttributes;
    const ids = first.map((row) => row.id);

    expect(ids).toEqual(second.map((row) => row.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(UUID_V5_PATTERN);
    }
  });

  it('derives different attribute ids for different products and positions', () => {
    const productId = catalogDataset.products[0].id;
    const otherProductId = catalogDataset.products[1].id;

    expect(deriveProductAttributeId(productId, 0)).not.toBe(
      deriveProductAttributeId(productId, 1),
    );
    expect(deriveProductAttributeId(productId, 0)).not.toBe(
      deriveProductAttributeId(otherProductId, 0),
    );
  });
});

describe('CatalogDatasetService.upsert', () => {
  it('upserts room types by code, forcing the fixed id and clearing the author', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const upserts = argsOf('roomType', 'upsert') as Array<{
      where: { code: string };
      create: { id: string };
      update: { id: string; updatedById: null; revision: string };
    }>;
    expect(upserts).toHaveLength(catalogDataset.roomTypes.length);
    catalogDataset.roomTypes.forEach((roomType, index) => {
      expect(upserts[index].where).toEqual({ code: roomType.code });
      expect(upserts[index].create.id).toBe(roomType.id);
      expect(upserts[index].update.id).toBe(roomType.id);
      expect(upserts[index].update.updatedById).toBeNull();
    });
  });

  it('upserts every seeded parent by its fixed id with a fresh revision', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const products = argsOf('product', 'upsert') as Array<{
      where: { id: string };
      update: { revision: string; updatedById: null };
    }>;
    expect(products.map((call) => call.where.id)).toEqual(
      catalogDataset.products.map((product) => product.id),
    );
    for (const call of products) {
      expect(call.update.updatedById).toBeNull();
      expect(call.update.revision).toEqual(expect.any(String));
    }

    expect(argsOf('image', 'upsert')).toHaveLength(
      catalogDataset.images.length,
    );
    expect(argsOf('style', 'upsert')).toHaveLength(
      catalogDataset.styles.length,
    );
    expect(argsOf('option', 'upsert')).toHaveLength(
      catalogDataset.options.length,
    );
  });

  it('replaces the children of seeded parents only', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const productIds = catalogDataset.products.map((product) => product.id);
    expect(argsOf('productImage', 'deleteMany')).toEqual([
      { where: { productId: { in: productIds } } },
    ]);
    expect(argsOf('productAttribute', 'deleteMany')).toEqual([
      { where: { productId: { in: productIds } } },
    ]);
    expect(argsOf('styleDefaultMaterial', 'deleteMany')).toEqual([
      {
        where: {
          styleId: { in: catalogDataset.styles.map((style) => style.id) },
        },
      },
    ]);
    expect(argsOf('optionRoomType', 'deleteMany')).toEqual([
      {
        where: {
          optionId: { in: catalogDataset.options.map((option) => option.id) },
        },
      },
    ]);
    expect(argsOf('roomTypeCategory', 'deleteMany')).toEqual([
      {
        where: {
          OR: catalogDataset.roomTypes.map((roomType) => ({
            roomTypeId: roomType.id,
            categoryId: { notIn: roomType.categoryIds },
          })),
        },
      },
    ]);
  });

  it('deletes children before inserting them again', async () => {
    const { tx, steps } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const order = steps();
    for (const model of [
      'productImage',
      'productAttribute',
      'styleDefaultMaterial',
      'optionRoomType',
    ]) {
      expect(lastIndex(order, `${model}.deleteMany`)).toBeLessThan(
        firstIndex(order, `${model}.createMany`),
      );
    }
    expect(firstIndex(order, 'roomTypeCategory.createMany')).toBeLessThan(
      firstIndex(order, 'styleDefaultMaterial.createMany'),
    );
  });

  it('moves seeded options past every existing sort order before rewriting them', async () => {
    const existingMax = 40;
    const { tx, steps, argsOf } = createTx(existingMax);

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const order = steps();
    expect(firstIndex(order, 'option.updateMany')).toBeLessThan(
      firstIndex(order, 'option.upsert'),
    );
    expect(argsOf('option', 'updateMany')).toEqual([
      {
        where: {
          id: { in: catalogDataset.options.map((option) => option.id) },
        },
        data: { sortOrder: { increment: existingMax + 1 } },
      },
    ]);
  });

  it('keeps shifted room type category orders clear of the final ones', async () => {
    const { tx, argsOf } = createTx(null);

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const longest = Math.max(
      ...catalogDataset.roomTypes.map(
        (roomType) => roomType.categoryIds.length,
      ),
    );
    const [shift] = argsOf('roomTypeCategory', 'updateMany') as Array<{
      data: { sortOrder: { increment: number } };
    }>;
    expect(shift.data.sortOrder.increment).toBeGreaterThanOrEqual(longest);
  });

  it('produces the same inserts when applied twice', async () => {
    const service = new CatalogDatasetService();
    const first = createTx();
    const second = createTx();

    await service.upsert(catalogDataset, first.tx);
    await service.upsert(catalogDataset, second.tx);

    expect(second.steps()).toEqual(first.steps());
    for (const model of [
      'roomTypeCategory',
      'productImage',
      'productAttribute',
      'styleDefaultMaterial',
      'optionRoomType',
    ]) {
      expect(second.argsOf(model, 'createMany')).toEqual(
        first.argsOf(model, 'createMany'),
      );
    }
  });

  it('never touches auth tables', async () => {
    const { tx, calls } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    expect(
      calls.filter(
        (call) => call.model === 'admin' || call.model === 'adminSession',
      ),
    ).toEqual([]);
  });
});

describe('CatalogDatasetService.replace', () => {
  it('deletes catalog tables in dependency order and keeps room types', async () => {
    const { tx, steps } = createTx();

    await new CatalogDatasetService().replace(catalogDataset, tx);

    const deletions = steps().filter((step) => step.endsWith('.deleteMany'));
    expect(deletions).toEqual([
      'styleDefaultMaterial.deleteMany',
      'optionRoomType.deleteMany',
      'productAttribute.deleteMany',
      'productImage.deleteMany',
      'product.deleteMany',
      'roomTypeCategory.deleteMany',
      'option.deleteMany',
      'engineeringPackageItem.deleteMany',
      'style.deleteMany',
      'category.deleteMany',
      'materialType.deleteMany',
      'image.deleteMany',
    ]);
  });

  it('deletes only uploaded and seed images', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().replace(catalogDataset, tx);

    expect(argsOf('image', 'deleteMany')).toEqual([
      {
        where: {
          OR: [
            { publicId: { startsWith: 'roomwise/uploads/' } },
            {
              publicId: {
                in: catalogDataset.images.map((image) => image.publicId),
              },
            },
            { id: { in: catalogDataset.images.map((image) => image.id) } },
          ],
        },
      },
    ]);
  });

  it('upserts room types after deleting and inserts parents before children in batches', async () => {
    const { tx, steps } = createTx();

    await new CatalogDatasetService().replace(catalogDataset, tx);

    const order = steps();
    const lastDeletion = lastIndex(order, 'image.deleteMany');
    const roomTypes = firstIndex(order, 'roomType.upsert');
    expect(roomTypes).toBeGreaterThan(lastDeletion);

    const inserts = order.filter((step) => step.endsWith('.createMany'));
    expect(inserts).toEqual([
      'image.createMany',
      'materialType.createMany',
      'category.createMany',
      'product.createMany',
      'style.createMany',
      'engineeringPackageItem.createMany',
      'option.createMany',
      'roomTypeCategory.createMany',
      'productImage.createMany',
      'productAttribute.createMany',
      'styleDefaultMaterial.createMany',
      'optionRoomType.createMany',
    ]);
    expect(firstIndex(order, 'image.createMany')).toBeGreaterThan(
      lastIndex(order, 'roomType.upsert'),
    );
    expect(
      order.filter(
        (step) => step.endsWith('.upsert') && !step.startsWith('roomType.'),
      ),
    ).toEqual([]);
  });

  it('never touches auth tables', async () => {
    const { tx, calls } = createTx();

    await new CatalogDatasetService().replace(catalogDataset, tx);

    expect(
      calls.filter(
        (call) => call.model === 'admin' || call.model === 'adminSession',
      ),
    ).toEqual([]);
  });
});
