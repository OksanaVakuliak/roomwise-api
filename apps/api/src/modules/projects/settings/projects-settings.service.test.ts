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
