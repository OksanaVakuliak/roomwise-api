import { Inject, Injectable } from '@nestjs/common';
import type { MaintenanceTask } from '../../../common/maintenance/maintenance-task.interface';
import { MaintenanceTaskProvider } from '../../../common/maintenance/maintenance-task-provider.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PROJECTS_SETTINGS_ID } from '../dataset/projects-settings';
import { IDEMPOTENCY_KEY_TTL_MS } from '../idempotency/idempotency.constants';
import { ProjectsSettingsService } from '../settings/projects-settings.service';

export const LEAD_RETENTION_TASK_NAME = 'lead-retention';
export const IDEMPOTENCY_KEYS_CLEANUP_TASK_NAME = 'idempotency-keys-cleanup';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RETENTION_INTERVAL_HOURS = 20;
const RETENTION_INTERVAL_MS = RETENTION_INTERVAL_HOURS * HOUR_MS;

@MaintenanceTaskProvider()
@Injectable()
export class LeadRetentionTask implements MaintenanceTask {
  readonly name = LEAD_RETENTION_TASK_NAME;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectsSettingsService)
    private readonly settings: ProjectsSettingsService,
  ) {}

  async isDue(now: Date): Promise<boolean> {
    const row = await this.prisma.projectsSettings.findUnique({
      where: { id: PROJECTS_SETTINGS_ID },
      select: { lastRetentionRunAt: true },
    });

    if (!row) {
      throw new Error('Projects settings are missing; run migrations.');
    }

    return (
      row.lastRetentionRunAt === null ||
      now.getTime() - row.lastRetentionRunAt.getTime() > RETENTION_INTERVAL_MS
    );
  }

  async run(now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { leadRetentionDays, updatedAt } =
        await tx.projectsSettings.findUniqueOrThrow({
          where: { id: PROJECTS_SETTINGS_ID },
          select: { leadRetentionDays: true, updatedAt: true },
        });
      const cutoff = new Date(now.getTime() - leadRetentionDays * DAY_MS);

      await tx.lead.deleteMany({ where: { createdAt: { lt: cutoff } } });
      await tx.projectsSettings.update({
        where: { id: PROJECTS_SETTINGS_ID },
        data: { lastRetentionRunAt: now, updatedAt },
      });
    });

    this.settings.invalidate();
  }
}

@MaintenanceTaskProvider()
@Injectable()
export class IdempotencyKeysCleanupTask implements MaintenanceTask {
  readonly name = IDEMPOTENCY_KEYS_CLEANUP_TASK_NAME;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isDue(): boolean {
    return true;
  }

  async run(now: Date): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MS) },
      },
    });
  }
}
