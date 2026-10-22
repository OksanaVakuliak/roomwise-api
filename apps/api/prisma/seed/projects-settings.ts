import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  PROJECTS_SETTINGS_ID,
  projectsSettingsDataset,
} from '../../src/modules/projects/dataset/projects-settings';

export async function seedProjectsSettings(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.projectsSettings.upsert({
    where: { id: PROJECTS_SETTINGS_ID },
    create: { id: PROJECTS_SETTINGS_ID, ...projectsSettingsDataset },
    update: {},
  });
}
