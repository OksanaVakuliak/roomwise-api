import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { seedProjectsSettings } from './projects-settings';

describe('seedProjectsSettings', () => {
  it('passes when the settings row exists and writes nothing', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 1 });
    const upsert = vi.fn();
    const prisma = {
      projectsSettings: { findUnique, upsert },
    } as unknown as PrismaClient;

    await expect(seedProjectsSettings(prisma)).resolves.toBeUndefined();

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { id: true },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('fails and points at migrations when the row is missing', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = {
      projectsSettings: { findUnique },
    } as unknown as PrismaClient;

    await expect(seedProjectsSettings(prisma)).rejects.toThrow(
      'Projects settings are missing; run migrations.',
    );
  });
});
