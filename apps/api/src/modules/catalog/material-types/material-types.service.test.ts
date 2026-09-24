import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { PublicationStatus } from '../../../generated/prisma/enums';
import { MaterialTypesService } from './material-types.service';

const ADMIN_ID = 'admin-1';
const MATERIAL_TYPE_ID = 'material-type-1';
const CURRENT_REVISION = 'revision-1';

function localized(en: string, uk: string) {
  return { en, uk };
}

function materialTypeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATERIAL_TYPE_ID,
    code: 'laminate',
    name: localized('Laminate', 'Ламінат'),
    status: PublicationStatus.DRAFT,
    revision: CURRENT_REVISION,
    updatedAt: new Date('2026-09-23T12:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    ...overrides,
  };
}

function createPrisma(
  materialTypeOverrides: Record<string, unknown> = {},
): PrismaService {
  return {
    materialType: {
      findMany: vi.fn().mockResolvedValue([materialTypeRow()]),
      findUnique: vi.fn().mockResolvedValue(materialTypeRow()),
      create: vi.fn().mockResolvedValue(materialTypeRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...materialTypeOverrides,
    },
  } as unknown as PrismaService;
}

describe('MaterialTypesService.list', () => {
  it('returns material types ordered by code with updatedBy', async () => {
    const prisma = createPrisma();
    const service = new MaterialTypesService(prisma);

    const result = await service.list();

    expect(prisma.materialType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { code: 'asc' } }),
    );
    expect(result).toEqual({
      items: [
        {
          id: MATERIAL_TYPE_ID,
          code: 'laminate',
          name: localized('Laminate', 'Ламінат'),
          status: PublicationStatus.DRAFT,
          revision: CURRENT_REVISION,
          updatedAt: '2026-09-23T12:00:00.000Z',
          updatedBy: { id: ADMIN_ID, login: 'admin' },
        },
      ],
    });
  });
});

describe('MaterialTypesService.create', () => {
  it('creates a material type with the given admin as updatedBy', async () => {
    const prisma = createPrisma({
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(materialTypeRow()),
    });
    const service = new MaterialTypesService(prisma);

    const result = await service.create(
      { code: 'laminate', name: localized('Laminate', 'Ламінат') },
      ADMIN_ID,
    );

    expect(prisma.materialType.create).toHaveBeenCalledWith({
      data: {
        code: 'laminate',
        name: localized('Laminate', 'Ламінат'),
        updatedById: ADMIN_ID,
      },
      include: { updatedBy: { select: { id: true, login: true } } },
    });
    expect(result.code).toBe('laminate');
  });

  it('throws CODE_TAKEN when the code already exists', async () => {
    const prisma = createPrisma({
      findUnique: vi.fn().mockResolvedValue({ id: 'existing' }),
      create: vi.fn(),
    });
    const service = new MaterialTypesService(prisma);

    await expect(
      service.create(
        { code: 'laminate', name: localized('Laminate', 'Ламінат') },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.CODE_TAKEN });
    expect(prisma.materialType.create).not.toHaveBeenCalled();
  });

  it('maps a unique-constraint race on code to CODE_TAKEN', async () => {
    const create = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`code`)',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['code'] },
        },
      ),
    );
    const prisma = createPrisma({
      findUnique: vi.fn().mockResolvedValue(null),
      create,
    });
    const service = new MaterialTypesService(prisma);

    await expect(
      service.create(
        { code: 'laminate', name: localized('Laminate', 'Ламінат') },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.CODE_TAKEN });
  });
});

describe('MaterialTypesService.update', () => {
  it('bumps revision and updatedBy, then returns the reloaded material type', async () => {
    const prisma = createPrisma();
    const service = new MaterialTypesService(prisma);

    const result = await service.update(
      MATERIAL_TYPE_ID,
      { name: localized('Laminate', 'Ламінат'), revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(prisma.materialType.updateMany).toHaveBeenCalledWith({
      where: { id: MATERIAL_TYPE_ID, revision: CURRENT_REVISION },
      data: expect.objectContaining({
        name: localized('Laminate', 'Ламінат'),
        status: PublicationStatus.DRAFT,
        updatedById: ADMIN_ID,
      }),
    });
    expect(result.id).toBe(MATERIAL_TYPE_ID);
  });

  it('throws NOT_FOUND when the material type does not exist', async () => {
    const prisma = createPrisma({
      findUnique: vi.fn().mockResolvedValue(null),
    });
    const service = new MaterialTypesService(prisma);

    await expect(
      service.update(
        MATERIAL_TYPE_ID,
        { revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('throws STALE_REVISION when the revision does not match', async () => {
    const prisma = createPrisma({
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(materialTypeRow())
        .mockResolvedValueOnce({ revision: 'revision-2' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    const service = new MaterialTypesService(prisma);

    await expect(
      service.update(
        MATERIAL_TYPE_ID,
        { revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: 'revision-2' },
    });
  });

  it('requires both translations when publishing', async () => {
    const prisma = createPrisma({
      findUnique: vi
        .fn()
        .mockResolvedValue(
          materialTypeRow({ name: localized('Laminate', '') }),
        ),
    });
    const service = new MaterialTypesService(prisma);

    await expect(
      service.update(
        MATERIAL_TYPE_ID,
        { status: PublicationStatus.PUBLISHED, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.TRANSLATION_MISSING,
      params: { fields: ['name.uk'] },
    });
    expect(prisma.materialType.updateMany).not.toHaveBeenCalled();
  });

  it('allows publishing when both translations are present', async () => {
    const prisma = createPrisma({
      findUnique: vi.fn().mockResolvedValue(materialTypeRow()),
    });
    const service = new MaterialTypesService(prisma);

    const result = await service.update(
      MATERIAL_TYPE_ID,
      { status: PublicationStatus.PUBLISHED, revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(prisma.materialType.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PublicationStatus.PUBLISHED }),
      }),
    );
    expect(result.id).toBe(MATERIAL_TYPE_ID);
  });
});
