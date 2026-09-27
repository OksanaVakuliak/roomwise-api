import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../common/clock/clock';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppEnv } from '../../config/env';
import type { SandboxState } from '../../generated/prisma/client';
import { SandboxService } from './sandbox.service';
import { SandboxCatchUpInterceptor } from './sandbox-catch-up.interceptor';
import { SandboxSchedule } from './sandbox-schedule';

const NOW = new Date('2026-09-27T00:30:00.000Z');

function createContext(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path }),
    }),
  } as unknown as ExecutionContext;
}

function createHandler(steps: string[]): CallHandler {
  return {
    handle: vi.fn(() => {
      steps.push('handler');
      return of('response');
    }),
  };
}

function createInterceptor(nextResetAt: Date) {
  const steps: string[] = [];
  const state: SandboxState = {
    id: 1,
    lastResetAt: null,
    lastResetStatus: null,
    lastResetError: null,
    nextResetAt,
    lockedAt: null,
  };
  let releaseTransaction: () => void = () => {};
  const transactionGate = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  const sandboxState = {
    findUnique: vi.fn().mockResolvedValue(state),
    findUniqueOrThrow: vi.fn().mockResolvedValue(state),
    createMany: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const $transaction = vi.fn(async () => {
    await transactionGate;
    steps.push('reset');
  });
  const prisma = { sandboxState, $transaction } as unknown as PrismaService;
  const clock = { now: () => NOW } as Clock;
  const config = {
    get: vi.fn((key: keyof AppEnv) =>
      key === 'SANDBOX_RESET_TIME' ? '03:00' : 'Europe/Kyiv',
    ),
  };
  const sandbox = new SandboxService(prisma, clock, config as never, []);
  const interceptor = new SandboxCatchUpInterceptor(
    new SandboxSchedule(sandbox, clock),
    clock,
  );

  return {
    interceptor,
    steps,
    sandboxState,
    $transaction,
    releaseTransaction: () => releaseTransaction(),
  };
}

describe('SandboxCatchUpInterceptor', () => {
  it('passes non-admin requests straight through', async () => {
    const { interceptor, steps, sandboxState } = createInterceptor(
      new Date('2026-09-27T00:00:00.000Z'),
    );
    const handler = createHandler(steps);

    await lastValueFrom(
      interceptor.intercept(createContext('/api/v1/catalog/styles'), handler),
    );

    expect(steps).toEqual(['handler']);
    expect(sandboxState.findUnique).not.toHaveBeenCalled();
  });

  it('runs a due reset before the admin request', async () => {
    const { interceptor, steps, releaseTransaction } = createInterceptor(
      new Date('2026-09-27T00:00:00.000Z'),
    );
    releaseTransaction();

    const result = await lastValueFrom(
      interceptor.intercept(
        createContext('/api/v1/admin/products'),
        createHandler(steps),
      ),
    );

    expect(result).toBe('response');
    expect(steps).toEqual(['reset', 'handler']);
  });

  it('lets concurrent admin requests share one reset', async () => {
    const { interceptor, steps, $transaction, releaseTransaction } =
      createInterceptor(new Date('2026-09-27T00:00:00.000Z'));

    const requests = [1, 2, 3].map(() =>
      lastValueFrom(
        interceptor.intercept(
          createContext('/api/v1/admin/styles'),
          createHandler(steps),
        ),
      ),
    );
    await vi.waitFor(() => expect($transaction).toHaveBeenCalled());
    releaseTransaction();
    await Promise.all(requests);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['reset', 'handler', 'handler', 'handler']);
  });

  it('reads the database only once while no reset is due', async () => {
    const { interceptor, steps, sandboxState, $transaction } =
      createInterceptor(new Date('2026-09-28T00:00:00.000Z'));

    for (let request = 0; request < 3; request += 1) {
      await lastValueFrom(
        interceptor.intercept(
          createContext('/api/v1/admin/options'),
          createHandler(steps),
        ),
      );
    }

    expect(sandboxState.findUnique).toHaveBeenCalledTimes(1);
    expect(sandboxState.updateMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(steps).toEqual(['handler', 'handler', 'handler']);
  });

  it('does not query the database again after a completed reset', async () => {
    const { interceptor, steps, sandboxState, releaseTransaction } =
      createInterceptor(new Date('2026-09-27T00:00:00.000Z'));
    releaseTransaction();

    for (let request = 0; request < 3; request += 1) {
      await lastValueFrom(
        interceptor.intercept(
          createContext('/api/v1/admin/categories'),
          createHandler(steps),
        ),
      );
    }

    expect(sandboxState.findUnique).toHaveBeenCalledTimes(2);
    expect(sandboxState.updateMany).toHaveBeenCalledTimes(1);
  });
});
