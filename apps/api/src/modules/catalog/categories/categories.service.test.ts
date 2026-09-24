import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  PublicationStatus,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { CategoriesService } from './categories.service';

const CATEGORY_ID = 'category-1';
const ADMIN_ID = 'admin-1';
const REVISION = 'revision-1';
const NEXT_REVISION = 'revision-2';

function localized(en: string, uk: string) {
  return { en, uk };
}

function decimal(value: number) {
  return { toNumber: () => value };
}

function createAdminCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    name: localized('Tiles', 'Плитка'),
    wastePercent: decimal(10),
    surface: SurfaceKind.FLOOR,
    status: PublicationStatus.DRAFT,
    revision: REVISION,
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    _count: { products: 0 },
    roomTypeCategories: [],
    ...overrides,
  };
}

function createPrisma(overrides: Record<string, unknown> = {}) {
  return {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      ...(overrides.category as Record<string, unknown> | undefined),
    },
  } as unknown as PrismaService;
}

describe('CategoriesService.list', () => {
  it('maps categories including productCount, roomTypeCodes and updatedBy', async () => {
    const findMany = vi.fn().mockResolvedValue([
      createAdminCategoryRow({
        _count: { products: 3 },
        roomTypeCategories: [
          { roomType: { code: 'LIVING_ROOM' } },
          { roomType: { code: 'BEDROOM' } },
        ],
      }),
    ]);
    const prisma = createPrisma({ category: { findMany } });
    const service = new CategoriesService(prisma);

    const result = await service.list({});

    expect(result.items).toEqual([
      {
        id: CATEGORY_ID,
        name: localized('Tiles', 'Плитка'),
        wastePercent: 10,
        surface: SurfaceKind.FLOOR,
        status: PublicationStatus.DRAFT,
        productCount: 3,
        roomTypeCodes: ['LIVING_ROOM', 'BEDROOM'],
        revision: REVISION,
        updatedAt: '2026-09-24T00:00:00.000Z',
        updatedBy: { id: ADMIN_ID, login: 'admin' },
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('filters by status when provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({ category: { findMany } });
    const service = new CategoriesService(prisma);

    await service.list({ status: PublicationStatus.PUBLISHED });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PublicationStatus.PUBLISHED },
      }),
    );
  });
});

describe('CategoriesService.create', () => {
  it('creates a draft category owned by the current admin', async () => {
    const create = vi.fn().mockResolvedValue(createAdminCategoryRow());
    const prisma = createPrisma({ category: { create } });
    const service = new CategoriesService(prisma);

    const result = await service.create(
      { name: localized('', ''), wastePercent: 10, surface: SurfaceKind.FLOOR },
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublicationStatus.DRAFT,
          updatedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.status).toBe(PublicationStatus.DRAFT);
  });
});

describe('CategoriesService.update', () => {
  it('applies a partial patch when the revision matches', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue(createAdminCategoryRow());
    const prisma = createPrisma({ category: { updateMany, findUnique } });
    const service = new CategoriesService(prisma);

    const result = await service.update(
      CATEGORY_ID,
      { wastePercent: 15, revision: REVISION },
      ADMIN_ID,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CATEGORY_ID, revision: REVISION },
        data: expect.objectContaining({ wastePercent: 15 }),
      }),
    );
    expect(result.id).toBe(CATEGORY_ID);
  });

  it('rejects a stale revision with the current one', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue({ revision: NEXT_REVISION });
    const prisma = createPrisma({ category: { updateMany, findUnique } });
    const service = new CategoriesService(prisma);

    await expect(
      service.update(CATEGORY_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: 'STALE_REVISION',
      params: { currentRevision: NEXT_REVISION },
    });
  });

  it('rejects an unknown category', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrisma({ category: { updateMany, findUnique } });
    const service = new CategoriesService(prisma);

    await expect(
      service.update(CATEGORY_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('CategoriesService.updateStatus', () => {
  it('publishes when both translations are present', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ name: localized('Tiles', 'Плитка') })
      .mockResolvedValueOnce(
        createAdminCategoryRow({ status: PublicationStatus.PUBLISHED }),
      );
    const prisma = createPrisma({ category: { updateMany, findUnique } });
    const service = new CategoriesService(prisma);

    const result = await service.updateStatus(
      CATEGORY_ID,
      { status: PublicationStatus.PUBLISHED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.status).toBe(PublicationStatus.PUBLISHED);
  });

  it('rejects publishing when a translation is missing', async () => {
    const updateMany = vi.fn();
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ name: localized('Tiles', '') });
    const prisma = createPrisma({ category: { updateMany, findUnique } });
    const service = new CategoriesService(prisma);

    await expect(
      service.updateStatus(
        CATEGORY_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'TRANSLATION_MISSING',
      params: { fields: ['name.uk'] },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('allows archiving without checking translations', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi
      .fn()
      .mockResolvedValue(
        createAdminCategoryRow({ status: PublicationStatus.ARCHIVED }),
      );
    const prisma = createPrisma({ category: { updateMany, findUnique } });
    const service = new CategoriesService(prisma);

    const result = await service.updateStatus(
      CATEGORY_ID,
      { status: PublicationStatus.ARCHIVED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.status).toBe(PublicationStatus.ARCHIVED);
  });
});

describe('CategoriesService.remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a category with no products and no room type links', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createAdminCategoryRow({
        _count: { products: 0 },
        roomTypeCategories: [],
      }),
    );
    const del = vi.fn().mockResolvedValue(undefined);
    const prisma = createPrisma({ category: { findUnique, delete: del } });
    const service = new CategoriesService(prisma);

    await service.remove(CATEGORY_ID);

    expect(del).toHaveBeenCalledWith({ where: { id: CATEGORY_ID } });
  });

  it('rejects deleting a category that has products', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createAdminCategoryRow({
        _count: { products: 2 },
        roomTypeCategories: [],
      }),
    );
    const prisma = createPrisma({ category: { findUnique } });
    const service = new CategoriesService(prisma);

    await expect(service.remove(CATEGORY_ID)).rejects.toMatchObject({
      code: 'CATEGORY_IN_USE',
      params: { productCount: 2, roomTypeCodes: [] },
    });
  });

  it('rejects deleting a category linked to room types', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createAdminCategoryRow({
        _count: { products: 0 },
        roomTypeCategories: [{ roomType: { code: 'BEDROOM' } }],
      }),
    );
    const prisma = createPrisma({ category: { findUnique } });
    const service = new CategoriesService(prisma);

    await expect(service.remove(CATEGORY_ID)).rejects.toMatchObject({
      code: 'CATEGORY_IN_USE',
      params: { productCount: 0, roomTypeCodes: ['BEDROOM'] },
    });
  });

  it('rejects deleting an unknown category', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrisma({ category: { findUnique } });
    const service = new CategoriesService(prisma);

    await expect(service.remove(CATEGORY_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
