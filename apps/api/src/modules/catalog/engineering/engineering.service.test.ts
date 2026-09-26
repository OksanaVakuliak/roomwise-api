import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { OptionUnit, PublicationStatus } from '../../../generated/prisma/enums';
import { EngineeringPackageItemsService } from './engineering.service';

const ITEM_ID = 'item-1';
const ADMIN_ID = 'admin-1';
const REVISION = 'revision-1';
const NEXT_REVISION = 'revision-2';

function localized(en: string, uk: string) {
  return { en, uk };
}

function createItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    name: localized('Electrical wiring', 'Електропроводка'),
    description: localized('Base wiring package', 'Базовий пакет проводки'),
    includedInBase: true,
    priceCents: null,
    unit: null,
    sortOrder: 0,
    status: PublicationStatus.DRAFT,
    revision: REVISION,
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedById: ADMIN_ID,
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    ...overrides,
  };
}

function createPrisma(overrides: Record<string, unknown> = {}) {
  const engineeringPackageItem = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(createItemRow()),
    create: vi.fn().mockResolvedValue(createItemRow()),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue(createItemRow()),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    ...(overrides.engineeringPackageItem as
      | Record<string, unknown>
      | undefined),
  };

  const $transaction = vi.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (client: unknown) => unknown)(undefined);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  return {
    engineeringPackageItem,
    $transaction,
  } as unknown as PrismaService;
}

describe('EngineeringPackageItemsService.list', () => {
  it('maps items ordered by sortOrder', async () => {
    const findMany = vi.fn().mockResolvedValue([
      createItemRow({ id: 'item-1', sortOrder: 0 }),
      createItemRow({
        id: 'item-2',
        sortOrder: 1,
        includedInBase: false,
        priceCents: 500,
        unit: OptionUnit.PIECE,
      }),
    ]);
    const prisma = createPrisma({ engineeringPackageItem: { findMany } });
    const service = new EngineeringPackageItemsService(prisma);

    const result = await service.list();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { sortOrder: 'asc' } }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'item-1',
        includedInBase: true,
        priceCents: null,
      }),
      expect.objectContaining({
        id: 'item-2',
        includedInBase: false,
        priceCents: 500,
        unit: OptionUnit.PIECE,
      }),
    ]);
  });
});

describe('EngineeringPackageItemsService.create', () => {
  it('creates a draft item without price or unit when included in base', async () => {
    const aggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: 2 } });
    const create = vi.fn().mockResolvedValue(createItemRow({ sortOrder: 3 }));
    const prisma = createPrisma({
      engineeringPackageItem: { aggregate, create },
    });
    const service = new EngineeringPackageItemsService(prisma);

    const result = await service.create(
      {
        name: localized('Electrical wiring', 'Електропроводка'),
        description: localized('Base wiring package', 'Базовий пакет проводки'),
        includedInBase: true,
      },
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          includedInBase: true,
          priceCents: null,
          unit: null,
          sortOrder: 3,
          status: PublicationStatus.DRAFT,
          updatedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.sortOrder).toBe(3);
  });

  it('rejects a non-base item without price or unit', async () => {
    const prisma = createPrisma();
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.create(
        {
          name: localized('Extra outlet', 'Додаткова розетка'),
          description: localized('Per outlet', 'За розетку'),
          includedInBase: false,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRICE_REQUIRED });
  });

  it('creates a non-base item with price and unit', async () => {
    const create = vi.fn().mockResolvedValue(
      createItemRow({
        includedInBase: false,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
      }),
    );
    const prisma = createPrisma({ engineeringPackageItem: { create } });
    const service = new EngineeringPackageItemsService(prisma);

    const result = await service.create(
      {
        name: localized('Extra outlet', 'Додаткова розетка'),
        description: localized('Per outlet', 'За розетку'),
        includedInBase: false,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
      },
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          includedInBase: false,
          priceCents: 1500,
          unit: OptionUnit.PIECE,
        }),
      }),
    );
    expect(result.priceCents).toBe(1500);
  });

  it('rejects a non-base item with a zero price', async () => {
    const prisma = createPrisma();
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.create(
        {
          name: localized('Extra outlet', 'Додаткова розетка'),
          description: localized('Per outlet', 'За розетку'),
          includedInBase: false,
          priceCents: 0,
          unit: OptionUnit.PIECE,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRICE_REQUIRED });
  });
});

describe('EngineeringPackageItemsService.update', () => {
  it('nulls price and unit once merged state becomes included in base', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(
        createItemRow({
          includedInBase: false,
          priceCents: 1500,
          unit: OptionUnit.PIECE,
        }),
      )
      .mockResolvedValueOnce(createItemRow({ includedInBase: true }));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({
      engineeringPackageItem: { findUnique, updateMany },
    });
    const service = new EngineeringPackageItemsService(prisma);

    await service.update(
      ITEM_ID,
      { includedInBase: true, revision: REVISION },
      ADMIN_ID,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: ITEM_ID, revision: REVISION },
      data: expect.objectContaining({
        includedInBase: true,
        priceCents: null,
        unit: null,
        updatedById: ADMIN_ID,
      }),
    });
  });

  it('rejects clearing the price on a merged non-base item', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(
      createItemRow({
        includedInBase: false,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
      }),
    );
    const prisma = createPrisma({ engineeringPackageItem: { findUnique } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.update(
        ITEM_ID,
        { priceCents: null, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRICE_REQUIRED });
  });

  it('rejects a patch that merges into a zero price', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(
      createItemRow({
        includedInBase: false,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
      }),
    );
    const prisma = createPrisma({ engineeringPackageItem: { findUnique } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.update(ITEM_ID, { priceCents: 0, revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRICE_REQUIRED });
  });

  it('rejects an explicit price on an item that is already included in base', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(createItemRow({ includedInBase: true }));
    const prisma = createPrisma({ engineeringPackageItem: { findUnique } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.update(
        ITEM_ID,
        { priceCents: 500, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      fields: [{ path: 'priceCents', code: 'PRICE_NOT_ALLOWED' }],
    });
  });

  it('rejects an explicit unit when toggling an item to included in base', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(
      createItemRow({
        includedInBase: false,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
      }),
    );
    const prisma = createPrisma({ engineeringPackageItem: { findUnique } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.update(
        ITEM_ID,
        { includedInBase: true, unit: OptionUnit.PIECE, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      fields: [{ path: 'unit', code: 'UNIT_NOT_ALLOWED' }],
    });
  });

  it('throws STALE_REVISION when the revision no longer matches', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(createItemRow())
      .mockResolvedValueOnce({ revision: NEXT_REVISION });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = createPrisma({
      engineeringPackageItem: { findUnique, updateMany },
    });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.update(ITEM_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: NEXT_REVISION },
    });
  });

  it('rejects a patch removing translations from a published item', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(
      createItemRow({
        status: PublicationStatus.PUBLISHED,
        includedInBase: false,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
      }),
    );
    const prisma = createPrisma({ engineeringPackageItem: { findUnique } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.update(
        ITEM_ID,
        { name: localized('', 'Оновлено'), revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.TRANSLATION_MISSING });
  });
});

describe('EngineeringPackageItemsService.updateStatus', () => {
  it('rejects publishing when a translation is missing', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(
        createItemRow({ name: localized('', 'Без назви') }),
      );
    const prisma = createPrisma({ engineeringPackageItem: { findUnique } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.updateStatus(
        ITEM_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.TRANSLATION_MISSING });
  });

  it('publishes when both translations are present', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(createItemRow())
      .mockResolvedValueOnce(
        createItemRow({ status: PublicationStatus.PUBLISHED }),
      );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({
      engineeringPackageItem: { findUnique, updateMany },
    });
    const service = new EngineeringPackageItemsService(prisma);

    const result = await service.updateStatus(
      ITEM_ID,
      { status: PublicationStatus.PUBLISHED, revision: REVISION },
      ADMIN_ID,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: ITEM_ID, revision: REVISION },
      data: expect.objectContaining({ status: PublicationStatus.PUBLISHED }),
    });
    expect(result.status).toBe(PublicationStatus.PUBLISHED);
  });
});

describe('EngineeringPackageItemsService.reorder', () => {
  it('rejects a set of ids that does not match the existing items', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }]);
    const prisma = createPrisma({ engineeringPackageItem: { findMany } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(
      service.reorder({ ids: ['item-1'] }, ADMIN_ID),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('reorders every item to match the given sequence', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }]);
    const update = vi.fn().mockResolvedValue(createItemRow());
    const prisma = createPrisma({
      engineeringPackageItem: { findMany, update },
    });
    const service = new EngineeringPackageItemsService(prisma);

    await service.reorder({ ids: ['item-2', 'item-1'] }, ADMIN_ID);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-2' },
        data: expect.objectContaining({ sortOrder: 0 }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({ sortOrder: 1 }),
      }),
    );
  });
});

describe('EngineeringPackageItemsService.remove', () => {
  it('throws NOT_FOUND when the item does not exist', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = createPrisma({ engineeringPackageItem: { deleteMany } });
    const service = new EngineeringPackageItemsService(prisma);

    await expect(service.remove(ITEM_ID)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('deletes an existing item', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ engineeringPackageItem: { deleteMany } });
    const service = new EngineeringPackageItemsService(prisma);

    await service.remove(ITEM_ID);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
  });
});
