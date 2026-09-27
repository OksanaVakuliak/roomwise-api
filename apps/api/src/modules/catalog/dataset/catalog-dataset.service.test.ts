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
  'update',
  'createMany',
  'deleteMany',
  'updateMany',
  'findMany',
  'findUnique',
] as const;

interface RecordedCall {
  model: string;
  operation: string;
  args: unknown;
}

function createTx(existing: Partial<Record<string, unknown[]>> = {}) {
  const calls: RecordedCall[] = [];
  const tx: Record<string, Record<string, unknown>> = {};

  for (const model of MODELS) {
    tx[model] = {};
    for (const operation of OPERATIONS) {
      tx[model][operation] = vi.fn(async (args: unknown) => {
        calls.push({ model, operation, args });
        if (operation === 'findMany') {
          return existing[model] ?? [];
        }
        if (operation === 'findUnique') {
          const where =
            (args as { where?: Record<string, unknown> })?.where ?? {};
          const rows = (existing[model] ?? []) as Array<
            Record<string, unknown>
          >;
          return (
            rows.find((row) =>
              Object.entries(where).every(([key, value]) => row[key] === value),
            ) ?? null
          );
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
    expect(argsOf('roomTypeCategory', 'deleteMany')).toEqual([]);
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

  it('upserts material types by code', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const upserts = argsOf('materialType', 'upsert') as Array<{
      where: { code: string };
      create: { id: string };
      update: { id: string };
    }>;
    expect(upserts.map((call) => call.where)).toEqual(
      catalogDataset.materialTypes.map((materialType) => ({
        code: materialType.code,
      })),
    );
    catalogDataset.materialTypes.forEach((materialType, index) => {
      expect(upserts[index].create.id).toBe(materialType.id);
      expect(upserts[index].update.id).toBe(materialType.id);
    });
  });

  it('updates a material type by id instead of upserting by code when its id already exists', async () => {
    const [materialType, ...rest] = catalogDataset.materialTypes;
    const existing = [{ id: materialType.id, code: 'old_code' }];
    const { tx, argsOf } = createTx({ materialType: existing });

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const updates = argsOf('materialType', 'update') as Array<{
      where: { id: string };
      data: { id: string; code: string };
    }>;
    expect(updates).toEqual([
      {
        where: { id: materialType.id },
        data: expect.objectContaining({
          id: materialType.id,
          code: materialType.code,
        }),
      },
    ]);

    const upserts = argsOf('materialType', 'upsert') as Array<{
      where: { code: string };
    }>;
    expect(upserts.map((call) => call.where)).toEqual(
      rest.map((entry) => ({ code: entry.code })),
    );
  });

  it('moves admin options after the seeded ones of the same kind', async () => {
    const [seeded] = catalogDataset.options;
    const sameKind = catalogDataset.options.filter(
      (option) => option.kind === seeded.kind,
    );
    const lastSeeded = Math.max(...sameKind.map((option) => option.sortOrder));
    const adminFirst = { id: 'admin-first', kind: seeded.kind, sortOrder: 0 };
    const adminSecond = {
      id: 'admin-second',
      kind: seeded.kind,
      sortOrder: 1,
    };
    const existing = [
      { id: seeded.id, kind: seeded.kind, sortOrder: 7 },
      adminFirst,
      adminSecond,
    ].sort((a, b) => a.sortOrder - b.sortOrder);
    const { tx, steps, argsOf } = createTx({ option: existing });

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    const order = steps();
    expect(lastIndex(order, 'option.update')).toBeLessThan(
      firstIndex(order, 'option.upsert'),
    );
    expect(firstIndex(order, 'option.updateMany')).toBeLessThan(
      firstIndex(order, 'option.update'),
    );
    expect(argsOf('option', 'updateMany')).toEqual([
      {
        where: { id: { in: existing.map((option) => option.id) } },
        data: { sortOrder: { decrement: 8 } },
      },
    ]);
    expect(argsOf('option', 'update')).toEqual([
      { where: { id: 'admin-first' }, data: { sortOrder: lastSeeded + 1 } },
      { where: { id: 'admin-second' }, data: { sortOrder: lastSeeded + 2 } },
    ]);
  });

  it('skips option reordering on an empty table', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    expect(argsOf('option', 'updateMany')).toEqual([]);
    expect(argsOf('option', 'update')).toEqual([]);
  });

  it('keeps admin room type categories and moves them after the seeded ones', async () => {
    const [roomType] = catalogDataset.roomTypes;
    const [seededCategoryId] = roomType.categoryIds;
    const existing = [
      { roomTypeId: roomType.id, categoryId: 'admin-category', sortOrder: 0 },
      { roomTypeId: roomType.id, categoryId: seededCategoryId, sortOrder: 4 },
    ];
    const { tx, steps, argsOf } = createTx({ roomTypeCategory: existing });

    await new CatalogDatasetService().upsert(catalogDataset, tx);

    expect(argsOf('roomTypeCategory', 'deleteMany')).toEqual([]);
    expect(argsOf('roomTypeCategory', 'updateMany')).toEqual([
      {
        where: {
          roomTypeId: {
            in: catalogDataset.roomTypes.map((entry) => entry.id),
          },
        },
        data: { sortOrder: { decrement: 5 } },
      },
    ]);
    expect(argsOf('roomTypeCategory', 'update')).toEqual([
      {
        where: {
          roomTypeId_categoryId: {
            roomTypeId: roomType.id,
            categoryId: 'admin-category',
          },
        },
        data: { sortOrder: roomType.categoryIds.length },
      },
      {
        where: {
          roomTypeId_categoryId: {
            roomTypeId: roomType.id,
            categoryId: seededCategoryId,
          },
        },
        data: { sortOrder: 0 },
      },
    ]);
    const order = steps();
    expect(lastIndex(order, 'roomTypeCategory.update')).toBeLessThan(
      firstIndex(order, 'roomTypeCategory.createMany'),
    );
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

  it('leaves revisions of recreated rows to the database default so each reset issues new ones', async () => {
    const { tx, argsOf } = createTx();

    await new CatalogDatasetService().replace(catalogDataset, tx);

    const models = [
      'materialType',
      'category',
      'product',
      'style',
      'engineeringPackageItem',
      'option',
    ];
    for (const model of models) {
      const [{ data }] = argsOf(model, 'createMany') as [
        { data: Record<string, unknown>[] },
      ];
      expect(data.length).toBeGreaterThan(0);
      for (const row of data) {
        expect(row).not.toHaveProperty('revision');
      }
    }
    for (const call of argsOf('roomType', 'upsert') as {
      update: { revision: string };
    }[]) {
      expect(call.update.revision).toEqual(expect.any(String));
    }
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
