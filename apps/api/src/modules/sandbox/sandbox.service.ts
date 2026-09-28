import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { Clock } from '../../common/clock/clock';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppEnv } from '../../config/env';
import { Prisma, type SandboxState } from '../../generated/prisma/client';
import { computeNextResetAt } from './next-reset-at';
import {
  SANDBOX_DATASET_PARTICIPANTS,
  type SandboxDatasetParticipant,
} from './sandbox-dataset-participant';

const SANDBOX_STATE_ID = 1;
export const LOCK_TIMEOUT_MS = 600_000;
const RETRY_AFTER_FAILURE_MS = 900_000;
const RESET_TRANSACTION_TIMEOUT_MS = 120_000;
const RESET_TRANSACTION_MAX_WAIT_MS = 30_000;
const MAX_ERROR_LENGTH = 200;

export const SANDBOX_RESET_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export const SANDBOX_RESET_OUTCOME = {
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const;

export type SandboxResetOutcome =
  (typeof SANDBOX_RESET_OUTCOME)[keyof typeof SANDBOX_RESET_OUTCOME];

export interface SandboxInfo {
  nextResetAt: Date;
  resetTime: string;
  timezone: string;
}

export class SandboxResetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SandboxResetError';
  }
}

export function describeResetError(error: unknown): string {
  const description =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? `${error.name} ${error.code}`
      : error instanceof Error
        ? error.name
        : 'UnknownError';

  return description.slice(0, MAX_ERROR_LENGTH);
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly resetTime: string;
  private readonly timezone: string;
  private cachedNextResetAt: Date | null = null;
  private inFlightReset: Promise<SandboxResetOutcome> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ConfigService) config: ConfigService<AppEnv, true>,
    @Inject(SANDBOX_DATASET_PARTICIPANTS)
    private readonly participants: SandboxDatasetParticipant[],
  ) {
    this.resetTime = config.get('SANDBOX_RESET_TIME', { infer: true });
    this.timezone = config.get('SANDBOX_TIMEZONE', { infer: true });
  }

  async getSandboxInfo(): Promise<SandboxInfo> {
    return {
      nextResetAt: await this.getNextResetAt(),
      resetTime: this.resetTime,
      timezone: this.timezone,
    };
  }

  async getNextResetAt(): Promise<Date> {
    if (this.cachedNextResetAt) {
      return this.cachedNextResetAt;
    }

    return this.refreshNextResetAt();
  }

  async refreshNextResetAt(): Promise<Date> {
    const state = await this.ensureState();
    this.cachedNextResetAt = state.nextResetAt;

    return state.nextResetAt;
  }

  reset(now: Date): Promise<SandboxResetOutcome> {
    if (!this.inFlightReset) {
      this.inFlightReset = this.performReset(now).finally(() => {
        this.inFlightReset = null;
      });
    }

    return this.inFlightReset;
  }

  private async performReset(now: Date): Promise<SandboxResetOutcome> {
    await this.ensureState();

    if (!(await this.claim(now))) {
      await this.refreshNextResetAt();
      this.logger.log('Sandbox reset skipped: not due or already running');
      return SANDBOX_RESET_OUTCOME.SKIPPED;
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const participant of this.participants) {
            await participant.replace(tx);
          }
        },
        {
          timeout: RESET_TRANSACTION_TIMEOUT_MS,
          maxWait: RESET_TRANSACTION_MAX_WAIT_MS,
        },
      );
    } catch (error) {
      const description = describeResetError(error);
      await this.recordFailure(now, description);
      throw new SandboxResetError(`Sandbox reset failed: ${description}`, {
        cause: error,
      });
    }

    await this.recordSuccess(now);
    await this.runAfterCommit();
    this.logger.log('Sandbox reset completed');

    return SANDBOX_RESET_OUTCOME.COMPLETED;
  }

  private async claim(now: Date): Promise<boolean> {
    const { count } = await this.prisma.sandboxState.updateMany({
      where: {
        id: SANDBOX_STATE_ID,
        nextResetAt: { lte: now },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
        ],
      },
      data: { lockedAt: now },
    });

    return count > 0;
  }

  private async recordSuccess(now: Date): Promise<void> {
    const nextResetAt = computeNextResetAt(now, this.resetTime, this.timezone);

    try {
      await this.prisma.sandboxState.update({
        where: { id: SANDBOX_STATE_ID },
        data: {
          lastResetAt: now,
          lastResetStatus: SANDBOX_RESET_STATUS.SUCCESS,
          lastResetError: null,
          nextResetAt,
          lockedAt: null,
        },
      });
      this.cachedNextResetAt = nextResetAt;
    } catch (error) {
      this.logger.error(
        'Failed to record the sandbox reset success',
        error instanceof Error ? error.stack : undefined,
      );
      Sentry.captureException(error);
      this.cachedNextResetAt = nextResetAt;
      await this.releaseLockBestEffort();
    }
  }

  private async releaseLockBestEffort(): Promise<void> {
    try {
      await this.prisma.sandboxState.update({
        where: { id: SANDBOX_STATE_ID },
        data: { lockedAt: null },
      });
    } catch (error) {
      this.logger.error(
        'Failed to release the sandbox lock after a reset',
        error instanceof Error ? error.stack : undefined,
      );
      Sentry.captureException(error);
    }
  }

  private async recordFailure(now: Date, description: string): Promise<void> {
    const nextResetAt = new Date(now.getTime() + RETRY_AFTER_FAILURE_MS);
    this.cachedNextResetAt = nextResetAt;

    try {
      await this.prisma.sandboxState.update({
        where: { id: SANDBOX_STATE_ID },
        data: {
          lastResetAt: now,
          lastResetStatus: SANDBOX_RESET_STATUS.FAILED,
          lastResetError: description,
          nextResetAt,
          lockedAt: null,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to record the sandbox reset failure',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async runAfterCommit(): Promise<void> {
    for (const participant of this.participants) {
      try {
        await participant.afterCommit?.();
      } catch (error) {
        this.logger.warn(
          `Sandbox cleanup of "${participant.name}" failed: ${describeResetError(error)}`,
        );
        Sentry.captureException(error);
      }
    }
  }

  private async ensureState(): Promise<SandboxState> {
    const existing = await this.prisma.sandboxState.findUnique({
      where: { id: SANDBOX_STATE_ID },
    });

    if (existing) {
      return existing;
    }

    await this.prisma.sandboxState.createMany({
      data: [
        {
          id: SANDBOX_STATE_ID,
          nextResetAt: computeNextResetAt(
            this.clock.now(),
            this.resetTime,
            this.timezone,
          ),
        },
      ],
      skipDuplicates: true,
    });

    return this.prisma.sandboxState.findUniqueOrThrow({
      where: { id: SANDBOX_STATE_ID },
    });
  }
}
