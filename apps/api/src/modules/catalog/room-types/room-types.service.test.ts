import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { RoomTypesService } from './room-types.service';

const ADMIN_ID = 'admin-1';
const ROOM_TYPE_ID = 'room-type-1';
const CATEGORY_ID_A = 'category-a';
const CATEGORY_ID_B = 'category-b';
const CATEGORY_ID_C = 'category-c';
const CURRENT_REVISION = 'revision-1';
const NEXT_REVISION = 'revision-2';

function localized(en: string, uk: string) {
  return { en, uk };
}

function roomTypeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOM_TYPE_ID,
    code: RoomTypeCode.BEDROOM,
    name: localized('Bedroom', 'Спальня'),
    revision: CURRENT_REVISION,
    updatedAt: new Date('2026-09-23T12:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    categories: [
      {
        category: {
          id: CATEGORY_ID_A,
          name: localized('Floor', 'Підлога'),
          status: PublicationStatus.PUBLISHED,
          surface: SurfaceKind.FLOOR,
        },
      },
    ],
    ...overrides,
  };
}

function createPrisma(
  overrides: Record<string, unknown> = {},
  keptLinks: { categoryId: string; sortOrder: number }[] = [],
) {
  const tx = {
    roomType: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    roomTypeCategory: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue(keptLinks),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    styleDefaultMaterial: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([
        { id: CATEGORY_ID_A, status: PublicationStatus.PUBLISHED },
        { id: CATEGORY_ID_B, status: PublicationStatus.PUBLISHED },
      ]),
    },
  };

  const base = {
    roomType: {
      findMany: vi.fn().mockResolvedValue([roomTypeRow()]),
      findUnique: vi.fn().mockResolvedValue(roomTypeRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<number>) =>
      run(tx),
    ),
    tx,
  };

  return { ...base, ...overrides } as unknown as PrismaService & {
    tx: typeof tx;
  };
}

function sortOrderUpdates(prisma: ReturnType<typeof createPrisma>) {
  return prisma.tx.roomTypeCategory.update.mock.calls.map(([args]) => [
    args.where.roomTypeId_categoryId.categoryId,
    args.data.sortOrder,
  ]);
}

describe('RoomTypesService.list', () => {
  it('returns room types with ordered categories and localized names whole', async () => {
    const prisma = createPrisma();
    const service = new RoomTypesService(prisma);

    const result = await service.list();

    expect(prisma.roomType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { sortOrder: 'asc' } }),
    );
    expect(result).toEqual({
      items: [
        {
          id: ROOM_TYPE_ID,
          code: RoomTypeCode.BEDROOM,
          name: localized('Bedroom', 'Спальня'),
          categories: [
            {
              id: CATEGORY_ID_A,
              name: localized('Floor', 'Підлога'),
              status: PublicationStatus.PUBLISHED,
              surface: SurfaceKind.FLOOR,
            },
          ],
          revision: CURRENT_REVISION,
          updatedAt: '2026-09-23T12:00:00.000Z',
          updatedBy: { id: ADMIN_ID, login: 'admin' },
        },
      ],
    });
  });
});

describe('RoomTypesService.updateName', () => {
  it('bumps revision and updatedBy, then returns the reloaded room type', async () => {
    const prisma = createPrisma();
    const service = new RoomTypesService(prisma);

    const result = await service.updateName(
      ROOM_TYPE_ID,
      { name: localized('Bedroom', 'Спальня'), revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(prisma.roomType.updateMany).toHaveBeenCalledWith({
      where: { id: ROOM_TYPE_ID, revision: CURRENT_REVISION },
      data: expect.objectContaining({
        name: localized('Bedroom', 'Спальня'),
        updatedById: ADMIN_ID,
        revision: expect.any(String),
      }),
    });
    expect(result.id).toBe(ROOM_TYPE_ID);
  });

  it('throws STALE_REVISION when the revision no longer matches', async () => {
    const prisma = createPrisma({
      roomType: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ revision: NEXT_REVISION }),
        findMany: vi.fn(),
      },
    });
    const service = new RoomTypesService(prisma);

    await expect(
      service.updateName(
        ROOM_TYPE_ID,
        { name: localized('Bedroom', 'Спальня'), revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: NEXT_REVISION },
    });
  });

  it('throws NOT_FOUND when the room type no longer exists', async () => {
    const prisma = createPrisma({
      roomType: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
      },
    });
    const service = new RoomTypesService(prisma);

    await expect(
      service.updateName(
        ROOM_TYPE_ID,
        { name: localized('Bedroom', 'Спальня'), revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });
});

describe('RoomTypesService.replaceCategories', () => {
  it('reorders kept links in two phases inside one transaction, bumping revision', async () => {
    const prisma = createPrisma({}, [
      { categoryId: CATEGORY_ID_A, sortOrder: 0 },
      { categoryId: CATEGORY_ID_B, sortOrder: 1 },
    ]);
    const service = new RoomTypesService(prisma);

    const result = await service.replaceCategories(
      ROOM_TYPE_ID,
      {
        categoryIds: [CATEGORY_ID_B, CATEGORY_ID_A],
        revision: CURRENT_REVISION,
      },
      ADMIN_ID,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.roomType.updateMany).toHaveBeenCalledWith({
      where: { id: ROOM_TYPE_ID, revision: CURRENT_REVISION },
      data: expect.objectContaining({ updatedById: ADMIN_ID }),
    });
    expect(prisma.tx.roomTypeCategory.deleteMany).toHaveBeenCalledWith({
      where: {
        roomTypeId: ROOM_TYPE_ID,
        categoryId: { notIn: [CATEGORY_ID_B, CATEGORY_ID_A] },
      },
    });
    expect(sortOrderUpdates(prisma)).toEqual([
      [CATEGORY_ID_B, -1],
      [CATEGORY_ID_A, -2],
      [CATEGORY_ID_B, 0],
      [CATEGORY_ID_A, 1],
    ]);
    expect(prisma.tx.roomTypeCategory.createMany).not.toHaveBeenCalled();
    expect(prisma.tx.styleDefaultMaterial.deleteMany).not.toHaveBeenCalled();
    expect(result.id).toBe(ROOM_TYPE_ID);
  });

  it('deletes removed links, moves kept ones and creates new ones at their final positions', async () => {
    const prisma = createPrisma({}, [
      { categoryId: CATEGORY_ID_A, sortOrder: 0 },
    ]);
    const service = new RoomTypesService(prisma);

    await service.replaceCategories(
      ROOM_TYPE_ID,
      {
        categoryIds: [CATEGORY_ID_B, CATEGORY_ID_A],
        revision: CURRENT_REVISION,
      },
      ADMIN_ID,
    );

    expect(prisma.tx.roomTypeCategory.deleteMany).toHaveBeenCalledWith({
      where: {
        roomTypeId: ROOM_TYPE_ID,
        categoryId: { notIn: [CATEGORY_ID_B, CATEGORY_ID_A] },
      },
    });
    expect(prisma.tx.roomTypeCategory.update).toHaveBeenNthCalledWith(1, {
      where: {
        roomTypeId_categoryId: {
          roomTypeId: ROOM_TYPE_ID,
          categoryId: CATEGORY_ID_A,
        },
      },
      data: { sortOrder: -1 },
    });
    expect(prisma.tx.roomTypeCategory.update).toHaveBeenNthCalledWith(2, {
      where: {
        roomTypeId_categoryId: {
          roomTypeId: ROOM_TYPE_ID,
          categoryId: CATEGORY_ID_A,
        },
      },
      data: { sortOrder: 1 },
    });
    expect(prisma.tx.roomTypeCategory.update).toHaveBeenCalledTimes(2);
    expect(prisma.tx.roomTypeCategory.createMany).toHaveBeenCalledWith({
      data: [
        { roomTypeId: ROOM_TYPE_ID, categoryId: CATEGORY_ID_B, sortOrder: 0 },
      ],
    });
    expect(prisma.tx.styleDefaultMaterial.deleteMany).not.toHaveBeenCalled();
  });

  it('parks moved links below every existing position before setting the final ones', async () => {
    const prisma = createPrisma({}, [
      { categoryId: CATEGORY_ID_A, sortOrder: -5 },
      { categoryId: CATEGORY_ID_B, sortOrder: 0 },
      { categoryId: CATEGORY_ID_C, sortOrder: 7 },
    ]);
    prisma.tx.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID_A, status: PublicationStatus.PUBLISHED },
      { id: CATEGORY_ID_B, status: PublicationStatus.PUBLISHED },
      { id: CATEGORY_ID_C, status: PublicationStatus.PUBLISHED },
    ]);
    const service = new RoomTypesService(prisma);

    await service.replaceCategories(
      ROOM_TYPE_ID,
      {
        categoryIds: [CATEGORY_ID_B, CATEGORY_ID_A, CATEGORY_ID_C],
        revision: CURRENT_REVISION,
      },
      ADMIN_ID,
    );

    expect(sortOrderUpdates(prisma)).toEqual([
      [CATEGORY_ID_A, -6],
      [CATEGORY_ID_C, -7],
      [CATEGORY_ID_A, 1],
      [CATEGORY_ID_C, 2],
    ]);
  });

  it('writes nothing to the links when the order is unchanged', async () => {
    const prisma = createPrisma({}, [
      { categoryId: CATEGORY_ID_A, sortOrder: 0 },
      { categoryId: CATEGORY_ID_B, sortOrder: 1 },
    ]);
    const service = new RoomTypesService(prisma);

    await service.replaceCategories(
      ROOM_TYPE_ID,
      {
        categoryIds: [CATEGORY_ID_A, CATEGORY_ID_B],
        revision: CURRENT_REVISION,
      },
      ADMIN_ID,
    );

    expect(prisma.tx.roomTypeCategory.update).not.toHaveBeenCalled();
    expect(prisma.tx.roomTypeCategory.createMany).not.toHaveBeenCalled();
  });

  it('deletes every link of the room type and leaves style defaults to the cascade when the category set is cleared', async () => {
    const prisma = createPrisma();
    const service = new RoomTypesService(prisma);

    await service.replaceCategories(
      ROOM_TYPE_ID,
      { categoryIds: [], revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(prisma.tx.roomTypeCategory.deleteMany).toHaveBeenCalledWith({
      where: { roomTypeId: ROOM_TYPE_ID },
    });
    expect(prisma.tx.roomTypeCategory.update).not.toHaveBeenCalled();
    expect(prisma.tx.roomTypeCategory.createMany).not.toHaveBeenCalled();
    expect(prisma.tx.styleDefaultMaterial.deleteMany).not.toHaveBeenCalled();
  });

  it('throws CATEGORY_NOT_FOUND inside the transaction, before any writes, when a category id does not exist', async () => {
    const tx = {
      roomType: { updateMany: vi.fn() },
      roomTypeCategory: { deleteMany: vi.fn(), createMany: vi.fn() },
      category: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: CATEGORY_ID_A, status: PublicationStatus.PUBLISHED },
          ]),
      },
    };
    const prisma = createPrisma({
      $transaction: vi.fn(async (run: (client: typeof tx) => Promise<number>) =>
        run(tx),
      ),
      tx,
    });
    const service = new RoomTypesService(prisma);

    await expect(
      service.replaceCategories(
        ROOM_TYPE_ID,
        {
          categoryIds: [CATEGORY_ID_A, CATEGORY_ID_B],
          revision: CURRENT_REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATEGORY_NOT_FOUND,
      params: { categoryIds: [CATEGORY_ID_B] },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.roomType.updateMany).not.toHaveBeenCalled();
  });

  it('throws CATEGORY_ARCHIVED inside the transaction, before any writes, when a category is archived', async () => {
    const tx = {
      roomType: { updateMany: vi.fn() },
      roomTypeCategory: { deleteMany: vi.fn(), createMany: vi.fn() },
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: CATEGORY_ID_A, status: PublicationStatus.PUBLISHED },
          { id: CATEGORY_ID_B, status: PublicationStatus.ARCHIVED },
        ]),
      },
    };
    const prisma = createPrisma({
      $transaction: vi.fn(async (run: (client: typeof tx) => Promise<number>) =>
        run(tx),
      ),
      tx,
    });
    const service = new RoomTypesService(prisma);

    await expect(
      service.replaceCategories(
        ROOM_TYPE_ID,
        {
          categoryIds: [CATEGORY_ID_A, CATEGORY_ID_B],
          revision: CURRENT_REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATEGORY_ARCHIVED,
      params: { categoryIds: [CATEGORY_ID_B] },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.roomType.updateMany).not.toHaveBeenCalled();
  });

  it('throws STALE_REVISION and does not delete or recreate rows when the revision no longer matches', async () => {
    const tx = {
      roomType: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      roomTypeCategory: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      styleDefaultMaterial: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      category: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: CATEGORY_ID_A, status: PublicationStatus.PUBLISHED },
          ]),
      },
    };
    const prisma = createPrisma({
      roomType: {
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ revision: NEXT_REVISION }),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (run: (client: typeof tx) => Promise<number>) =>
        run(tx),
      ),
      tx,
    });
    const service = new RoomTypesService(prisma);

    await expect(
      service.replaceCategories(
        ROOM_TYPE_ID,
        { categoryIds: [CATEGORY_ID_A], revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: NEXT_REVISION },
    });
    expect(tx.roomTypeCategory.deleteMany).not.toHaveBeenCalled();
    expect(tx.roomTypeCategory.update).not.toHaveBeenCalled();
    expect(tx.roomTypeCategory.createMany).not.toHaveBeenCalled();
    expect(tx.styleDefaultMaterial.deleteMany).not.toHaveBeenCalled();
  });
});
