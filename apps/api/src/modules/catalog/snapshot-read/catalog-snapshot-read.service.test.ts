import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { ProductUnit, RoomTypeCode } from '../../../generated/prisma/enums';
import type { ImageUrlBuilder } from '../images/image-urls';
import { CatalogSnapshotReadService } from './catalog-snapshot-read.service';

const name = { en: 'Name', uk: 'Назва' };

const emptyIds = {
  productIds: [],
  categoryIds: [],
  roomTypeIds: [],
  optionIds: [],
  packageItemIds: [],
  styleId: null,
};

function productRow(images: unknown[]) {
  return {
    id: 'product-1',
    name,
    brand: 'Brand',
    manufacturer: 'Maker',
    color: name,
    size: name,
    unit: ProductUnit.SQM,
    images,
  };
}

function createService(models: Record<string, unknown[]> = {}) {
  const prisma: Record<string, unknown> = {};
  for (const model of [
    'product',
    'category',
    'roomType',
    'option',
    'engineeringPackageItem',
    'style',
  ]) {
    const rows = models[model] ?? [];
    prisma[model] = {
      findMany: vi.fn().mockResolvedValue(rows),
      findUnique: vi.fn().mockResolvedValue(rows[0] ?? null),
    };
  }
  const imageUrls = { toImageRef: vi.fn() };
  const service = new CatalogSnapshotReadService(
    prisma as unknown as PrismaService,
    imageUrls as unknown as ImageUrlBuilder,
  );
  return { service, prisma, imageUrls };
}

function findManyArgs(prisma: Record<string, unknown>, model: string) {
  const { findMany } = prisma[model] as {
    findMany: ReturnType<typeof vi.fn>;
  };
  return findMany.mock.calls[0]?.[0];
}

describe('CatalogSnapshotReadService', () => {
  it('skips queries for empty ids', async () => {
    const { service, prisma } = createService();

    const data = await service.read(emptyIds);

    expect(data.products.size).toBe(0);
    expect(data.style).toBeNull();
    for (const model of Object.values(prisma) as Array<{
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    }>) {
      expect(model.findMany).not.toHaveBeenCalled();
      expect(model.findUnique).not.toHaveBeenCalled();
    }
  });

  it('reads products without a status filter, main image first', async () => {
    const { service, prisma } = createService({
      product: [productRow([{ image: { id: 'image-1', publicId: 'a/b' } }])],
    });

    const data = await service.read({ ...emptyIds, productIds: ['product-1'] });

    expect(data.products.get('product-1')).toEqual({
      id: 'product-1',
      name,
      brand: 'Brand',
      manufacturer: 'Maker',
      color: name,
      size: name,
      unit: ProductUnit.SQM,
      image: { id: 'image-1', publicId: 'a/b' },
    });
    const args = findManyArgs(prisma, 'product');
    expect(args.where).toEqual({ id: { in: ['product-1'] } });
    expect(args.select.images.orderBy).toEqual({ sortOrder: 'asc' });
    expect(args.select.images.take).toBe(1);
  });

  it('returns a null image when the product has none', async () => {
    const { service } = createService({ product: [productRow([])] });

    const data = await service.read({ ...emptyIds, productIds: ['product-1'] });

    expect(data.products.get('product-1')?.image).toBeNull();
  });

  it('reads names of the other entities without a status filter', async () => {
    const { service, prisma } = createService({
      category: [{ id: 'category-1', name }],
      roomType: [{ id: 'room-1', code: RoomTypeCode.KITCHEN, name }],
      option: [{ id: 'option-1', name }],
      engineeringPackageItem: [{ id: 'item-1', name }],
      style: [{ id: 'style-1', name }],
    });

    const data = await service.read({
      productIds: [],
      categoryIds: ['category-1'],
      roomTypeIds: ['room-1'],
      optionIds: ['option-1'],
      packageItemIds: ['item-1'],
      styleId: 'style-1',
    });

    expect(data.categories.get('category-1')).toEqual({
      id: 'category-1',
      name,
    });
    expect(data.roomTypes.get('room-1')).toEqual({
      id: 'room-1',
      code: RoomTypeCode.KITCHEN,
      name,
    });
    expect(data.options.get('option-1')).toEqual({ id: 'option-1', name });
    expect(data.packageItems.get('item-1')).toEqual({ id: 'item-1', name });
    expect(data.style).toEqual({ id: 'style-1', name });
    for (const model of [
      'category',
      'roomType',
      'option',
      'engineeringPackageItem',
    ]) {
      expect(findManyArgs(prisma, model).where).not.toHaveProperty('status');
    }
  });

  it('delegates image refs to the url builder', () => {
    const { service, imageUrls } = createService();
    const ref = { id: 'image-1', thumb: 't', card: 'c', zoom: 'z' };
    imageUrls.toImageRef.mockReturnValue(ref);

    expect(service.imageRef({ id: 'image-1', publicId: 'a' })).toBe(ref);
  });
});
