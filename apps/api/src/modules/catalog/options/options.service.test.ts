import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  OptionKind,
  OptionUnit,
  PublicationStatus,
} from '../../../generated/prisma/enums';
import type { ImageUrlBuilder } from '../images/image-urls';
import { OptionsService } from './options.service';

const OPTION_ID = 'option-1';
const ADMIN_ID = 'admin-1';
const REVISION = 'revision-1';
const NEXT_REVISION = 'revision-2';

function localized(en: string, uk: string) {
  return { en, uk };
}

function createImageUrls(): ImageUrlBuilder {
  return {
    toImageRef: vi.fn((image: { id: string; publicId: string }) => ({
      id: image.id,
      thumb: `thumb/${image.publicId}`,
      card: `card/${image.publicId}`,
      zoom: `zoom/${image.publicId}`,
    })),
    toTextureRef: vi.fn(),
  } as unknown as ImageUrlBuilder;
}

function createOptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OPTION_ID,
    kind: OptionKind.ENGINEERING,
    name: localized('Heated floor', 'Тепла підлога'),
    description: localized('Warms the floor', 'Обігрів підлоги'),
    imageId: null,
    image: null,
    priceCents: 3500,
    unit: OptionUnit.ROOM_SQM,
    minQuantity: null,
    maxQuantity: null,
    sortOrder: 0,
    status: PublicationStatus.DRAFT,
    revision: REVISION,
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedById: ADMIN_ID,
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    optionRoomTypes: [],
    ...overrides,
  };
}

function createPrisma(overrides: Record<string, unknown> = {}) {
  const option = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(createOptionRow()),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    ...(overrides.option as Record<string, unknown> | undefined),
  };
  const optionRoomType = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    ...(overrides.optionRoomType as Record<string, unknown> | undefined),
  };
  const image = {
    findMany: vi.fn().mockResolvedValue([]),
    ...(overrides.image as Record<string, unknown> | undefined),
  };
  const roomType = {
    findMany: vi.fn().mockResolvedValue([]),
    ...(overrides.roomType as Record<string, unknown> | undefined),
  };

  const tx = { option, optionRoomType, image, roomType };

  const $transaction = vi.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (client: typeof tx) => unknown)(tx);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  return {
    option,
    optionRoomType,
    image,
    roomType,
    $transaction,
    tx,
  } as unknown as PrismaService & { tx: typeof tx };
}

function baseCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    kind: OptionKind.ENGINEERING,
    name: localized('Heated floor', 'Тепла підлога'),
    description: localized('Warms the floor', 'Обігрів підлоги'),
    priceCents: 3500,
    confirmZeroPrice: false,
    unit: OptionUnit.ROOM_SQM,
    roomTypeIds: [] as string[],
    ...overrides,
  };
}

describe('OptionsService.list', () => {
  it('filters by kind when provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({ option: { findMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.list({ kind: OptionKind.ADDITIONAL });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: OptionKind.ADDITIONAL } }),
    );
  });

  it('returns every kind when no filter is given', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({ option: { findMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.list({});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe('OptionsService.create', () => {
  it('creates a draft option with the next sort order scoped to its kind', async () => {
    const aggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: 2 } });
    const create = vi.fn().mockResolvedValue(createOptionRow());
    const prisma = createPrisma({ option: { aggregate, create } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.create(baseCreateInput(), ADMIN_ID);

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: OptionKind.ENGINEERING } }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublicationStatus.DRAFT,
          sortOrder: 3,
          updatedById: ADMIN_ID,
        }),
      }),
    );
  });

  it('rejects zero price without confirmation', async () => {
    const prisma = createPrisma();
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(
        baseCreateInput({ priceCents: 0, confirmZeroPrice: false }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'ZERO_PRICE_NOT_CONFIRMED' });
  });

  it('allows zero price when confirmed', async () => {
    const create = vi.fn().mockResolvedValue(createOptionRow());
    const prisma = createPrisma({ option: { create } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.create(
      baseCreateInput({ priceCents: 0, confirmZeroPrice: true }),
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalled();
  });

  it('rejects non-empty roomTypeIds for a PIECE option', async () => {
    const prisma = createPrisma();
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(
        baseCreateInput({
          unit: OptionUnit.PIECE,
          minQuantity: 1,
          maxQuantity: 5,
          roomTypeIds: ['room-1'],
        }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'ROOM_TYPES_NOT_ALLOWED' });
  });

  it('rejects non-empty roomTypeIds for a PROJECT option', async () => {
    const prisma = createPrisma();
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(
        baseCreateInput({ unit: OptionUnit.PROJECT, roomTypeIds: ['room-1'] }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'ROOM_TYPES_NOT_ALLOWED' });
  });

  it('rejects a PIECE option missing both quantity bounds', async () => {
    const prisma = createPrisma();
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(baseCreateInput({ unit: OptionUnit.PIECE }), ADMIN_ID),
    ).rejects.toMatchObject({ code: 'QUANTITY_BOUNDS_REQUIRED' });
  });

  it('rejects a PIECE option where min exceeds max', async () => {
    const prisma = createPrisma();
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(
        baseCreateInput({
          unit: OptionUnit.PIECE,
          minQuantity: 5,
          maxQuantity: 2,
        }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'QUANTITY_BOUNDS_REQUIRED' });
  });

  it('nulls quantity bounds for non-PIECE units even when provided', async () => {
    const create = vi.fn().mockResolvedValue(createOptionRow());
    const prisma = createPrisma({ option: { create } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.create(
      baseCreateInput({
        unit: OptionUnit.ROOM,
        minQuantity: 1,
        maxQuantity: 5,
      }),
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ minQuantity: null, maxQuantity: null }),
      }),
    );
  });

  it('creates the option-room-type rows for a perRoom option', async () => {
    const create = vi.fn().mockResolvedValue(createOptionRow());
    const roomTypeFindMany = vi
      .fn()
      .mockResolvedValue([{ id: 'room-1' }, { id: 'room-2' }]);
    const prisma = createPrisma({
      option: { create },
      roomType: { findMany: roomTypeFindMany },
    });
    const service = new OptionsService(prisma, createImageUrls());

    await service.create(
      baseCreateInput({ roomTypeIds: ['room-1', 'room-2'] }),
      ADMIN_ID,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          optionRoomTypes: {
            create: [{ roomTypeId: 'room-1' }, { roomTypeId: 'room-2' }],
          },
        }),
      }),
    );
  });

  it('rejects an unknown room type id', async () => {
    const roomTypeFindMany = vi.fn().mockResolvedValue([{ id: 'room-1' }]);
    const prisma = createPrisma({
      roomType: { findMany: roomTypeFindMany },
    });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(
        baseCreateInput({ roomTypeIds: ['room-1', 'missing-room'] }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE',
      params: { roomTypeIds: ['missing-room'] },
    });
  });

  it('rejects an unknown image id', async () => {
    const imageFindMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrisma({ image: { findMany: imageFindMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.create(baseCreateInput({ imageId: 'missing-image' }), ADMIN_ID),
    ).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
      params: { imageIds: ['missing-image'] },
    });
  });
});

describe('OptionsService.update', () => {
  it('rejects a stale revision with the current one', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(createOptionRow())
      .mockResolvedValueOnce({ revision: NEXT_REVISION });
    const prisma = createPrisma({ option: { updateMany, findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.update(OPTION_ID, { revision: REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: 'STALE_REVISION',
      params: { currentRevision: NEXT_REVISION },
    });
  });

  it('rejects QUANTITY_BOUNDS_REQUIRED on the merged state when only maxQuantity is patched too low', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      createOptionRow({
        unit: OptionUnit.PIECE,
        minQuantity: 5,
        maxQuantity: 10,
      }),
    );
    const prisma = createPrisma({ option: { findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.update(
        OPTION_ID,
        { maxQuantity: 3, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'QUANTITY_BOUNDS_REQUIRED' });
  });

  it('rejects switching to PIECE without quantity bounds', async () => {
    const findUnique = vi.fn().mockResolvedValue(createOptionRow());
    const prisma = createPrisma({ option: { findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.update(
        OPTION_ID,
        { unit: OptionUnit.PIECE, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'QUANTITY_BOUNDS_REQUIRED' });
  });

  it('rejects providing roomTypeIds while switching to a non-perRoom unit', async () => {
    const findUnique = vi.fn().mockResolvedValue(createOptionRow());
    const prisma = createPrisma({ option: { findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.update(
        OPTION_ID,
        {
          unit: OptionUnit.PROJECT,
          roomTypeIds: ['room-1'],
          revision: REVISION,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'ROOM_TYPES_NOT_ALLOWED' });
  });

  it('clears existing option-room-type rows when the unit moves away from perRoom without roomTypeIds given', async () => {
    const findUnique = vi.fn().mockResolvedValue(createOptionRow());
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = createPrisma({
      option: { findUnique, updateMany },
      optionRoomType: { deleteMany },
    });
    const service = new OptionsService(prisma, createImageUrls());

    await service.update(
      OPTION_ID,
      { unit: OptionUnit.PROJECT, revision: REVISION },
      ADMIN_ID,
    );

    expect(deleteMany).toHaveBeenCalledWith({ where: { optionId: OPTION_ID } });
  });

  it('replaces option-room-type rows when roomTypeIds is provided for a perRoom option', async () => {
    const findUnique = vi.fn().mockResolvedValue(createOptionRow());
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const roomTypeFindMany = vi.fn().mockResolvedValue([{ id: 'room-3' }]);
    const prisma = createPrisma({
      option: { findUnique, updateMany },
      optionRoomType: { deleteMany, createMany },
      roomType: { findMany: roomTypeFindMany },
    });
    const service = new OptionsService(prisma, createImageUrls());

    await service.update(
      OPTION_ID,
      { roomTypeIds: ['room-3'], revision: REVISION },
      ADMIN_ID,
    );

    expect(deleteMany).toHaveBeenCalledWith({ where: { optionId: OPTION_ID } });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ optionId: OPTION_ID, roomTypeId: 'room-3' }],
    });
  });

  it('moves the option to the end of the new kind when kind changes', async () => {
    const findUnique = vi.fn().mockResolvedValue(createOptionRow());
    const aggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: 4 } });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({
      option: { findUnique, aggregate, updateMany },
    });
    const service = new OptionsService(prisma, createImageUrls());

    await service.update(
      OPTION_ID,
      { kind: OptionKind.ADDITIONAL, revision: REVISION },
      ADMIN_ID,
    );

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: OptionKind.ADDITIONAL } }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 5 }),
      }),
    );
  });

  it('rejects zero price without confirmation on patch', async () => {
    const findUnique = vi.fn().mockResolvedValue(createOptionRow());
    const prisma = createPrisma({ option: { findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.update(
        OPTION_ID,
        { priceCents: 0, confirmZeroPrice: false, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'ZERO_PRICE_NOT_CONFIRMED' });
  });

  it('rejects patching a published option into a missing translation', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(
        createOptionRow({ status: PublicationStatus.PUBLISHED }),
      );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ option: { findUnique, updateMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.update(
        OPTION_ID,
        { name: localized('Heated floor', ''), revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'TRANSLATION_MISSING' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('allows patching a published option when the merged result stays publishable', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(
        createOptionRow({ status: PublicationStatus.PUBLISHED }),
      );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ option: { findUnique, updateMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.update(
      OPTION_ID,
      { description: localized('New', 'Новий'), revision: REVISION },
      ADMIN_ID,
    );

    expect(updateMany).toHaveBeenCalled();
  });
});

describe('OptionsService.reorder', () => {
  it('rejects a set missing an existing option in the same kind', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'option-1' }, { id: 'option-2' }]);
    const prisma = createPrisma({ option: { findMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.reorder(
        { kind: OptionKind.ENGINEERING, ids: ['option-1'] },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('scopes the existing set lookup to the given kind', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'option-1' }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({ option: { findMany, update } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.reorder(
      { kind: OptionKind.ADDITIONAL, ids: ['option-1'] },
      ADMIN_ID,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: OptionKind.ADDITIONAL } }),
    );
  });

  it('reorders every option matching the full existing set within the kind', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'option-1' }, { id: 'option-2' }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({ option: { findMany, update } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.reorder(
      { kind: OptionKind.ENGINEERING, ids: ['option-2', 'option-1'] },
      ADMIN_ID,
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'option-2' },
        data: expect.objectContaining({ sortOrder: 0 }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'option-1' },
        data: expect.objectContaining({ sortOrder: 1 }),
      }),
    );
  });

  it('moves every option to a temporary negative sort order before assigning the final values, to avoid colliding with the unique (kind, sortOrder) index', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'option-1' }, { id: 'option-2' }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = createPrisma({ option: { findMany, update } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.reorder(
      { kind: OptionKind.ENGINEERING, ids: ['option-2', 'option-1'] },
      ADMIN_ID,
    );

    const sortOrders = update.mock.calls.map((call) => {
      const [{ where, data }] = call as [
        { where: { id: string }; data: { sortOrder: number } },
      ];
      return { id: where.id, sortOrder: data.sortOrder };
    });

    expect(sortOrders).toEqual([
      { id: 'option-2', sortOrder: -1 },
      { id: 'option-1', sortOrder: -2 },
      { id: 'option-2', sortOrder: 0 },
      { id: 'option-1', sortOrder: 1 },
    ]);
  });

  it('reports VALIDATION_FAILED instead of a raw error when an option vanishes mid-transaction', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'option-1' }, { id: 'option-2' }]);
    const prisma = createPrisma({ option: { findMany } });
    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    prisma.$transaction = vi.fn().mockRejectedValue(p2025);
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.reorder(
        { kind: OptionKind.ENGINEERING, ids: ['option-2', 'option-1'] },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('OptionsService.updateStatus', () => {
  it('rejects publishing when a translation is missing', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({
      name: localized('Heated floor', ''),
      description: localized('Warms', 'Обігрів'),
      priceCents: 3500,
    });
    const prisma = createPrisma({ option: { findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.updateStatus(
        OPTION_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: 'TRANSLATION_MISSING',
      params: { fields: ['name.uk'] },
    });
  });

  it('rejects publishing a zero-priced option', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({
      name: localized('Heated floor', 'Тепла підлога'),
      description: localized('Warms', 'Обігрів'),
      priceCents: 0,
    });
    const prisma = createPrisma({ option: { findUnique } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(
      service.updateStatus(
        OPTION_ID,
        { status: PublicationStatus.PUBLISHED, revision: REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: 'PRICE_REQUIRED' });
  });

  it('publishes when translations and price are present', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({
        name: localized('Heated floor', 'Тепла підлога'),
        description: localized('Warms', 'Обігрів'),
        priceCents: 3500,
      })
      .mockResolvedValueOnce(
        createOptionRow({ status: PublicationStatus.PUBLISHED }),
      );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ option: { findUnique, updateMany } });
    const service = new OptionsService(prisma, createImageUrls());

    const result = await service.updateStatus(
      OPTION_ID,
      { status: PublicationStatus.PUBLISHED, revision: REVISION },
      ADMIN_ID,
    );

    expect(result.status).toBe(PublicationStatus.PUBLISHED);
  });
});

describe('OptionsService.remove', () => {
  it('deletes an existing option', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrisma({ option: { deleteMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await service.remove(OPTION_ID);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: OPTION_ID } });
  });

  it('rejects deleting an unknown option', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = createPrisma({ option: { deleteMany } });
    const service = new OptionsService(prisma, createImageUrls());

    await expect(service.remove(OPTION_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
