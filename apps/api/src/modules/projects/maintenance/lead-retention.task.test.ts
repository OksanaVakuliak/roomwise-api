import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { ProjectsSettingsService } from '../settings/projects-settings.service';
import {
  IdempotencyKeysCleanupTask,
  LeadRetentionTask,
} from './lead-retention.task';

const NOW = new Date('2026-10-24T03:00:00.000Z');
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function createRetention(
  settings: {
    lastRetentionRunAt: Date | null;
    leadRetentionDays: number;
  } | null,
) {
  const prisma = {
    projectsSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
      findUniqueOrThrow: vi.fn().mockResolvedValue(settings),
      update: vi.fn().mockReturnValue('update-op'),
    },
    lead: { deleteMany: vi.fn().mockReturnValue('delete-op') },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const projectsSettings = { invalidate: vi.fn() };

  return {
    prisma,
    projectsSettings,
    task: new LeadRetentionTask(
      prisma as unknown as PrismaService,
      projectsSettings as unknown as ProjectsSettingsService,
    ),
  };
}

describe('LeadRetentionTask', () => {
  it('is named lead-retention', () => {
    expect(createRetention(null).task.name).toBe('lead-retention');
  });

  it('is due when it has never run', async () => {
    const { task } = createRetention({
      lastRetentionRunAt: null,
      leadRetentionDays: 30,
    });

    expect(await task.isDue(NOW)).toBe(true);
  });

  it('is due when the last run is older than 20 hours', async () => {
    const { task } = createRetention({
      lastRetentionRunAt: new Date(NOW.getTime() - 20 * HOUR_MS - 1),
      leadRetentionDays: 30,
    });

    expect(await task.isDue(NOW)).toBe(true);
  });

  it('is not due when the last run is within 20 hours', async () => {
    const { task } = createRetention({
      lastRetentionRunAt: new Date(NOW.getTime() - 20 * HOUR_MS),
      leadRetentionDays: 30,
    });

    expect(await task.isDue(NOW)).toBe(false);
  });

  it('fails when the settings row is missing', async () => {
    await expect(createRetention(null).task.isDue(NOW)).rejects.toThrow(
      'Projects settings are missing',
    );
  });

  it('deletes leads older than the configured days and records the run', async () => {
    const { task, prisma, projectsSettings } = createRetention({
      lastRetentionRunAt: null,
      leadRetentionDays: 7,
    });

    await task.run(NOW);

    expect(prisma.lead.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - 7 * DAY_MS) } },
    });
    expect(prisma.projectsSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastRetentionRunAt: NOW },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'delete-op',
      'update-op',
    ]);
    expect(projectsSettings.invalidate).toHaveBeenCalledOnce();
  });

  it('leaves the cache alone when the transaction fails', async () => {
    const { task, prisma, projectsSettings } = createRetention({
      lastRetentionRunAt: null,
      leadRetentionDays: 7,
    });
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(task.run(NOW)).rejects.toThrow('db down');
    expect(projectsSettings.invalidate).not.toHaveBeenCalled();
  });
});

describe('IdempotencyKeysCleanupTask', () => {
  function createCleanup() {
    const prisma = {
      idempotencyKey: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };

    return {
      prisma,
      task: new IdempotencyKeysCleanupTask(prisma as unknown as PrismaService),
    };
  }

  it('is named idempotency-keys-cleanup and always due', () => {
    const { task } = createCleanup();

    expect(task.name).toBe('idempotency-keys-cleanup');
    expect(task.isDue()).toBe(true);
  });

  it('deletes keys older than 24 hours', async () => {
    const { task, prisma } = createCleanup();

    await task.run(NOW);

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - DAY_MS) } },
    });
  });
});
