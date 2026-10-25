import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { ProjectsSettingsService } from './projects-settings.service';

const row = {
  id: 1,
  calculationValidityDays: 14,
  leadRetentionDays: 30,
  leadFormNotice: { en: 'en {days}', uk: 'uk {days}' },
  lastRetentionRunAt: null,
  revision: '7c1d6a8e-5b0e-4c7e-9a52-2f6f4e1b7a10',
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  updatedById: null,
};

function createService(findUnique: ReturnType<typeof vi.fn>) {
  const prisma = {
    projectsSettings: { findUnique },
  } as unknown as PrismaService;
  return new ProjectsSettingsService(prisma);
}

describe('ProjectsSettingsService', () => {
  it('returns the settings without the row id', async () => {
    const service = createService(vi.fn().mockResolvedValue(row));

    const { id: _id, ...expected } = row;

    expect(await service.get()).toEqual(expected);
  });

  it('shares one read between concurrent first calls and caches the result', async () => {
    const findUnique = vi.fn().mockResolvedValue(row);
    const service = createService(findUnique);

    const [first, second] = await Promise.all([service.get(), service.get()]);
    await service.get();

    expect(first).toBe(second);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('reads again after invalidate', async () => {
    const findUnique = vi.fn().mockResolvedValue(row);
    const service = createService(findUnique);

    await service.get();
    service.invalidate();
    await service.get();

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  describe('update', () => {
    const admin = { id: 'admin-1', login: 'admin' };

    function createUpdatable(updateMany: ReturnType<typeof vi.fn>) {
      const findUnique = vi.fn().mockResolvedValue({
        ...row,
        updatedBy: admin,
      });
      const prisma = {
        projectsSettings: { findUnique, updateMany },
      } as unknown as PrismaService;
      return { service: new ProjectsSettingsService(prisma), findUnique };
    }

    it('updates only the given fields, stamps the admin and invalidates the cache', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const { service, findUnique } = createUpdatable(updateMany);
      await service.get();

      const result = await service.update(
        { leadRetentionDays: 10, revision: row.revision },
        admin.id,
      );
      await service.get();

      const call = updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 1, revision: row.revision });
      expect(call.data).toMatchObject({
        leadRetentionDays: 10,
        updatedById: admin.id,
      });
      expect(call.data).not.toHaveProperty('calculationValidityDays');
      expect(call.data.revision).not.toBe(row.revision);
      expect(findUnique).toHaveBeenCalledTimes(3);
      expect(result.updatedBy).toEqual(admin);
      expect(result.lastRetentionRunAt).toBeNull();
    });

    it('rejects a notice missing the placeholder without touching the row', async () => {
      const updateMany = vi.fn();
      const { service } = createUpdatable(updateMany);

      await expect(
        service.update(
          {
            leadFormNotice: { en: 'no placeholder', uk: 'ok {days}' },
            revision: row.revision,
          },
          admin.id,
        ),
      ).rejects.toMatchObject({
        code: 'NOTICE_PLACEHOLDER_MISSING',
        params: { languages: ['en'] },
      });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('throws a stale revision error when the revision does not match', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });
      const { service } = createUpdatable(updateMany);

      await expect(
        service.update(
          { calculationValidityDays: 5, revision: 'stale' },
          admin.id,
        ),
      ).rejects.toMatchObject({
        code: 'STALE_REVISION',
        params: { currentRevision: row.revision },
      });
    });
  });

  it('throws when the row is missing and retries on the next call', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row);
    const service = createService(findUnique);

    await expect(service.get()).rejects.toThrow('run the seed');
    await expect(service.get()).resolves.toMatchObject({
      leadRetentionDays: 30,
    });
  });
});
