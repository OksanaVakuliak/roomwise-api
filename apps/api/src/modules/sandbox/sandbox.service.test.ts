import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../common/clock/clock';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppEnv } from '../../config/env';
import { Prisma, type SandboxState } from '../../generated/prisma/client';
import {
  describeResetError,
  SANDBOX_RESET_OUTCOME,
  SANDBOX_RESET_STATUS,
  SandboxResetError,
  SandboxService,
} from './sandbox.service';
import type { SandboxDatasetParticipant } from './sandbox-dataset-participant';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

const NOW = new Date('2026-09-27T00:30:00.000Z');
const NEXT_AFTER_NOW = new Date('2026-09-28T00:00:00.000Z');
const TODAY_RESET = new Date('2026-09-27T00:00:00.000Z');
const LOCK_TIMEOUT_MS = 600_000;
const RETRY_AFTER_FAILURE_MS = 900_000;
const TX = { marker: 'tx' } as unknown as Prisma.TransactionClient;

function createState(overrides: Partial<SandboxState> = {}): SandboxState {
  return {
    id: 1,
    lastResetAt: null,
    lastResetStatus: null,
    lastResetError: null,
    nextResetAt: TODAY_RESET,
    lockedAt: null,
    ...overrides,
  };
}

function createPrisma(state: SandboxState | null, claimedCount = 1) {
  const sandboxState = {
    findUnique: vi.fn().mockResolvedValue(state),
    findUniqueOrThrow: vi.fn().mockResolvedValue(state ?? createState()),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: claimedCount }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const $transaction = vi.fn(
    async (run: (tx: Prisma.TransactionClient) => Promise<void>) => run(TX),
  );

  return {
    prisma: { sandboxState, $transaction } as unknown as PrismaService,
    sandboxState,
    $transaction,
  };
}

function createConfig(): ConfigService<AppEnv, true> {
  const values: Partial<AppEnv> = {
    SANDBOX_RESET_TIME: '03:00',
    SANDBOX_TIMEZONE: 'Europe/Kyiv',
  };

  return {
    get: vi.fn((key: keyof AppEnv) => values[key]),
  } as unknown as ConfigService<AppEnv, true>;
}

function createParticipant(
  name: string,
  steps: string[],
  overrides: Partial<SandboxDatasetParticipant> = {},
): SandboxDatasetParticipant {
  return {
    name,
    replace: vi.fn(async (tx: Prisma.TransactionClient) => {
      expect(tx).toBe(TX);
      steps.push(`${name}.replace`);
    }),
    afterCommit: vi.fn(async () => {
      steps.push(`${name}.afterCommit`);
    }),
    ...overrides,
  };
}

function createService(
  prisma: PrismaService,
  participants: SandboxDatasetParticipant[] = [],
): SandboxService {
  return new SandboxService(
    prisma,
    { now: () => NOW } as Clock,
    createConfig(),
    participants,
  );
}

describe('SandboxService', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  describe('state', () => {
    it('creates the state row lazily with the next reset after now', async () => {
      const { prisma, sandboxState } = createPrisma(null);
      sandboxState.findUniqueOrThrow.mockResolvedValue(
        createState({ nextResetAt: NEXT_AFTER_NOW }),
      );

      const nextResetAt = await createService(prisma).getNextResetAt();

      expect(sandboxState.createMany).toHaveBeenCalledWith({
        data: [{ id: 1, nextResetAt: NEXT_AFTER_NOW }],
        skipDuplicates: true,
      });
      expect(nextResetAt).toEqual(NEXT_AFTER_NOW);
    });

    it('serves the next reset from memory after the first read', async () => {
      const { prisma, sandboxState } = createPrisma(createState());
      const service = createService(prisma);

      await service.getNextResetAt();
      await service.getNextResetAt();
      const info = await service.getSandboxInfo();

      expect(sandboxState.findUnique).toHaveBeenCalledTimes(1);
      expect(info).toEqual({
        nextResetAt: TODAY_RESET,
        resetTime: '03:00',
        timezone: 'Europe/Kyiv',
      });
    });

    it('rereads the state when asked to refresh', async () => {
      const { prisma, sandboxState } = createPrisma(createState());
      const service = createService(prisma);

      await service.getNextResetAt();
      await service.refreshNextResetAt();

      expect(sandboxState.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('claims the lock only when due and not held by a live reset', async () => {
      const { prisma, sandboxState } = createPrisma(createState());

      await createService(prisma).reset(NOW);

      expect(sandboxState.updateMany).toHaveBeenCalledWith({
        where: {
          id: 1,
          nextResetAt: { lte: NOW },
          OR: [
            { lockedAt: null },
            { lockedAt: { lt: new Date(NOW.getTime() - LOCK_TIMEOUT_MS) } },
          ],
        },
        data: { lockedAt: NOW },
      });
    });

    it('skips without touching data when the lock is not claimed', async () => {
      const { prisma, $transaction, sandboxState } = createPrisma(
        createState({ lockedAt: NOW }),
        0,
      );
      const steps: string[] = [];
      const participant = createParticipant('catalog', steps);

      const outcome = await createService(prisma, [participant]).reset(NOW);

      expect(outcome).toBe(SANDBOX_RESET_OUTCOME.SKIPPED);
      expect($transaction).not.toHaveBeenCalled();
      expect(sandboxState.update).not.toHaveBeenCalled();
      expect(steps).toEqual([]);
    });

    it('runs participants in order inside one transaction, then records success and runs cleanups', async () => {
      const { prisma, $transaction, sandboxState } = createPrisma(
        createState(),
      );
      const steps: string[] = [];
      const service = createService(prisma, [
        createParticipant('catalog', steps),
        createParticipant('pricing', steps),
      ]);

      const outcome = await service.reset(NOW);

      expect(outcome).toBe(SANDBOX_RESET_OUTCOME.COMPLETED);
      expect($transaction).toHaveBeenCalledTimes(1);
      expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 120_000,
        maxWait: 30_000,
      });
      expect(steps).toEqual([
        'catalog.replace',
        'pricing.replace',
        'catalog.afterCommit',
        'pricing.afterCommit',
      ]);
      expect(sandboxState.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          lastResetAt: NOW,
          lastResetStatus: SANDBOX_RESET_STATUS.SUCCESS,
          lastResetError: null,
          nextResetAt: NEXT_AFTER_NOW,
          lockedAt: null,
        },
      });
      expect(await service.getNextResetAt()).toEqual(NEXT_AFTER_NOW);
    });

    it('records the state before running cleanups', async () => {
      const { prisma, sandboxState } = createPrisma(createState());
      const participant = createParticipant('catalog', [], {
        afterCommit: vi.fn(async () => {
          expect(sandboxState.update).toHaveBeenCalled();
        }),
      });

      await createService(prisma, [participant]).reset(NOW);

      expect(participant.afterCommit).toHaveBeenCalled();
    });

    it('marks the reset failed, unlocks and backs off when a participant fails', async () => {
      const { prisma, sandboxState, $transaction } = createPrisma(
        createState(),
      );
      $transaction.mockImplementation(async (run) => {
        await run(TX);
      });
      const steps: string[] = [];
      const failure = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on login "secret@example.com"',
        { code: 'P2002', clientVersion: '7.0.0' },
      );
      const service = createService(prisma, [
        createParticipant('catalog', steps),
        createParticipant('pricing', steps, {
          replace: vi.fn().mockRejectedValue(failure),
        }),
      ]);

      await expect(service.reset(NOW)).rejects.toBeInstanceOf(
        SandboxResetError,
      );

      const retryAt = new Date(NOW.getTime() + RETRY_AFTER_FAILURE_MS);
      expect(sandboxState.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          lastResetAt: NOW,
          lastResetStatus: SANDBOX_RESET_STATUS.FAILED,
          lastResetError: 'PrismaClientKnownRequestError P2002',
          nextResetAt: retryAt,
          lockedAt: null,
        },
      });
      expect(steps).toEqual(['catalog.replace']);
      expect(await service.getNextResetAt()).toEqual(retryAt);
    });

    it('still reports the failure when recording it fails', async () => {
      const { prisma, sandboxState, $transaction } = createPrisma(
        createState(),
      );
      $transaction.mockRejectedValue(new Error('connection lost'));
      sandboxState.update.mockRejectedValue(new Error('connection lost'));
      const service = createService(prisma);

      await expect(service.reset(NOW)).rejects.toBeInstanceOf(
        SandboxResetError,
      );
      expect(await service.getNextResetAt()).toEqual(
        new Date(NOW.getTime() + RETRY_AFTER_FAILURE_MS),
      );
    });

    it('completes the reset when a cleanup fails', async () => {
      const { prisma } = createPrisma(createState());
      const steps: string[] = [];
      const service = createService(prisma, [
        createParticipant('catalog', steps, {
          afterCommit: vi.fn().mockRejectedValue(new Error('cloudinary down')),
        }),
        createParticipant('pricing', steps),
      ]);

      const outcome = await service.reset(NOW);

      expect(outcome).toBe(SANDBOX_RESET_OUTCOME.COMPLETED);
      expect(steps).toContain('pricing.afterCommit');
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    });

    it('shares one in-flight reset between concurrent callers', async () => {
      const { prisma, $transaction } = createPrisma(createState());
      const service = createService(prisma);

      const [first, second] = await Promise.all([
        service.reset(NOW),
        service.reset(NOW),
      ]);

      expect(first).toBe(SANDBOX_RESET_OUTCOME.COMPLETED);
      expect(second).toBe(SANDBOX_RESET_OUTCOME.COMPLETED);
      expect($transaction).toHaveBeenCalledTimes(1);
    });

    it('starts a new reset once the previous one settled', async () => {
      const { prisma, $transaction } = createPrisma(createState());
      const service = createService(prisma);

      await service.reset(NOW);
      await service.reset(NOW);

      expect($transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('describeResetError', () => {
    it('keeps only the error name and Prisma code', () => {
      expect(
        describeResetError(
          new Prisma.PrismaClientKnownRequestError('value "secret"', {
            code: 'P2003',
            clientVersion: '7.0.0',
          }),
        ),
      ).toBe('PrismaClientKnownRequestError P2003');
      expect(describeResetError(new TypeError('value "secret"'))).toBe(
        'TypeError',
      );
      expect(describeResetError('secret')).toBe('UnknownError');
    });
  });
});
