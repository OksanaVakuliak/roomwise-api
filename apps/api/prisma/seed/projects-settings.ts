import type { PrismaClient } from '../../src/generated/prisma/client';
import { PROJECTS_SETTINGS_ID } from '../../src/modules/projects/dataset/projects-settings';

export async function seedProjectsSettings(
  prisma: PrismaClient,
): Promise<void> {
  const row = await prisma.projectsSettings.findUnique({
    where: { id: PROJECTS_SETTINGS_ID },
    select: { id: true },
  });

  if (!row) {
    throw new Error('Projects settings are missing; run migrations.');
  }
}
