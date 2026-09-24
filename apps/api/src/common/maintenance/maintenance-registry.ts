import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import type { MaintenanceTask } from './maintenance-task.interface';
import { MaintenanceTaskProvider } from './maintenance-task-provider.decorator';

export const MAINTENANCE_TASK_STATUS = {
  SKIPPED_NOT_DUE: 'SKIPPED_NOT_DUE',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export type MaintenanceTaskStatus =
  (typeof MAINTENANCE_TASK_STATUS)[keyof typeof MAINTENANCE_TASK_STATUS];

export interface MaintenanceTaskResult {
  name: string;
  status: MaintenanceTaskStatus;
}

function isMaintenanceTask(value: unknown): value is MaintenanceTask {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<MaintenanceTask>;

  return (
    typeof candidate.name === 'string' &&
    typeof candidate.isDue === 'function' &&
    typeof candidate.run === 'function'
  );
}

@Injectable()
export class MaintenanceRegistry implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceRegistry.name);
  private discoveredTasks: MaintenanceTask[] | null = null;

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit(): void {
    this.discoveredTasks = this.discover();
  }

  tasks(): MaintenanceTask[] {
    if (this.discoveredTasks === null) {
      this.discoveredTasks = this.discover();
    }

    return this.discoveredTasks;
  }

  async runDue(now: Date): Promise<MaintenanceTaskResult[]> {
    const results: MaintenanceTaskResult[] = [];

    for (const task of this.tasks()) {
      results.push(await this.runTask(task, now));
    }

    return results;
  }

  private async runTask(
    task: MaintenanceTask,
    now: Date,
  ): Promise<MaintenanceTaskResult> {
    try {
      const isDue = await task.isDue(now);

      if (!isDue) {
        return {
          name: task.name,
          status: MAINTENANCE_TASK_STATUS.SKIPPED_NOT_DUE,
        };
      }

      await task.run(now);

      return { name: task.name, status: MAINTENANCE_TASK_STATUS.SUCCESS };
    } catch (error) {
      this.logger.error(
        `Maintenance task "${task.name}" failed`,
        error instanceof Error ? error.stack : undefined,
      );
      Sentry.captureException(error);

      return { name: task.name, status: MAINTENANCE_TASK_STATUS.FAILED };
    }
  }

  private discover(): MaintenanceTask[] {
    const wrappers = this.discoveryService.getProviders({
      metadataKey: MaintenanceTaskProvider.KEY,
    });

    const tasks: MaintenanceTask[] = [];
    const seenNames = new Set<string>();

    for (const wrapper of wrappers) {
      const instance: unknown = wrapper.instance;

      if (instance === undefined || instance === null) {
        continue;
      }

      if (!isMaintenanceTask(instance)) {
        throw new Error(
          `Maintenance task provider "${wrapper.name}" does not implement the MaintenanceTask contract`,
        );
      }

      if (seenNames.has(instance.name)) {
        throw new Error(`Duplicate maintenance task name: "${instance.name}"`);
      }

      seenNames.add(instance.name);
      tasks.push(instance);
    }

    return tasks;
  }
}
