import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { projectsSettingsDataset } from '../../src/modules/projects/dataset/projects-settings';
import { seedProjectsSettings } from './projects-settings';

describe('seedProjectsSettings', () => {
  it('creates the settings row and never overwrites an existing one', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = { projectsSettings: { upsert } } as unknown as PrismaClient;

    await seedProjectsSettings(prisma);

    expect(upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, ...projectsSettingsDataset },
      update: {},
    });
  });

  it('provides the days placeholder in both languages', () => {
    const { en, uk } = projectsSettingsDataset.leadFormNotice;

    expect(en).toContain('{days}');
    expect(uk).toContain('{days}');
  });
});
