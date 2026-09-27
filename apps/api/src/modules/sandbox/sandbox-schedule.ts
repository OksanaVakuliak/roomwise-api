import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Clock } from '../../common/clock/clock';
import type { MaintenanceTask } from '../../common/maintenance/maintenance-task.interface';
import { MaintenanceTaskProvider } from '../../common/maintenance/maintenance-task-provider.decorator';
import { SANDBOX_RESET_OUTCOME, SandboxService } from './sandbox.service';

export const SANDBOX_RESET_TASK_NAME = 'sandbox-reset';

export class SandboxResetSkippedError extends Error {
  constructor() {
    super('Sandbox reset skipped: lock held by another reset or not due');
    this.name = 'SandboxResetSkippedError';
  }
}

@MaintenanceTaskProvider()
@Injectable()
export class SandboxSchedule
  implements MaintenanceTask, OnApplicationBootstrap
{
  readonly name = SANDBOX_RESET_TASK_NAME;
  private readonly logger = new Logger(SandboxSchedule.name);

  constructor(
    @Inject(SandboxService) private readonly sandbox: SandboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async isDue(now: Date): Promise<boolean> {
    const nextResetAt = await this.sandbox.refreshNextResetAt();

    return nextResetAt.getTime() <= now.getTime();
  }

  async run(now: Date): Promise<void> {
    const outcome = await this.sandbox.reset(now);

    if (outcome === SANDBOX_RESET_OUTCOME.SKIPPED) {
      throw new SandboxResetSkippedError();
    }
  }

  onApplicationBootstrap(): void {
    void this.catchUp(this.clock.now());
  }

  async catchUp(now: Date): Promise<void> {
    try {
      const nextResetAt = await this.sandbox.getNextResetAt();

      if (nextResetAt.getTime() > now.getTime()) {
        return;
      }

      const outcome = await this.sandbox.reset(now);

      if (outcome === SANDBOX_RESET_OUTCOME.SKIPPED) {
        this.logger.debug(
          'Sandbox catch-up reset skipped: lock held elsewhere',
        );
      }
    } catch (error) {
      this.logger.error(
        'Sandbox catch-up reset failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
