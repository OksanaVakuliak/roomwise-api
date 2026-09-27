import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../common/clock/clock';
import { SANDBOX_RESET_OUTCOME, type SandboxService } from './sandbox.service';
import { SandboxResetSkippedError, SandboxSchedule } from './sandbox-schedule';

const NOW = new Date('2026-09-27T00:30:00.000Z');
const PAST = new Date('2026-09-27T00:00:00.000Z');
const FUTURE = new Date('2026-09-28T00:00:00.000Z');

function createSandbox(nextResetAt: Date) {
  return {
    getNextResetAt: vi.fn().mockResolvedValue(nextResetAt),
    refreshNextResetAt: vi.fn().mockResolvedValue(nextResetAt),
    reset: vi.fn().mockResolvedValue(SANDBOX_RESET_OUTCOME.COMPLETED),
  };
}

function createSchedule(sandbox: ReturnType<typeof createSandbox>) {
  return new SandboxSchedule(
    sandbox as unknown as SandboxService,
    { now: () => NOW } as Clock,
  );
}

describe('SandboxSchedule', () => {
  it('is named sandbox-reset', () => {
    expect(createSchedule(createSandbox(FUTURE)).name).toBe('sandbox-reset');
  });

  it('is due when the stored next reset is not after now', async () => {
    const sandbox = createSandbox(NOW);

    expect(await createSchedule(sandbox).isDue(NOW)).toBe(true);
    expect(sandbox.refreshNextResetAt).toHaveBeenCalled();
    expect(sandbox.getNextResetAt).not.toHaveBeenCalled();
  });

  it('is not due when the next reset is in the future', async () => {
    expect(await createSchedule(createSandbox(FUTURE)).isDue(NOW)).toBe(false);
  });

  it('runs the reset and lets its failure reach the registry', async () => {
    const sandbox = createSandbox(PAST);
    sandbox.reset.mockRejectedValue(new Error('boom'));

    await expect(createSchedule(sandbox).run(NOW)).rejects.toThrow('boom');
    expect(sandbox.reset).toHaveBeenCalledWith(NOW);
  });

  it('reports a skipped reset as a failure without changing the outcome contract', async () => {
    const sandbox = createSandbox(PAST);
    sandbox.reset.mockResolvedValue(SANDBOX_RESET_OUTCOME.SKIPPED);

    await expect(createSchedule(sandbox).run(NOW)).rejects.toBeInstanceOf(
      SandboxResetSkippedError,
    );
    expect(sandbox.reset).toHaveBeenCalledWith(NOW);
  });

  it('catches up with a due reset', async () => {
    const sandbox = createSandbox(PAST);

    await createSchedule(sandbox).catchUp(NOW);

    expect(sandbox.reset).toHaveBeenCalledWith(NOW);
  });

  it('does not reset when nothing is due', async () => {
    const sandbox = createSandbox(FUTURE);

    await createSchedule(sandbox).catchUp(NOW);

    expect(sandbox.reset).not.toHaveBeenCalled();
  });

  it('swallows catch-up failures', async () => {
    const sandbox = createSandbox(PAST);
    sandbox.reset.mockRejectedValue(new Error('boom'));

    await expect(createSchedule(sandbox).catchUp(NOW)).resolves.toBeUndefined();
  });

  it('swallows failures to read the state', async () => {
    const sandbox = createSandbox(PAST);
    sandbox.getNextResetAt.mockRejectedValue(new Error('db down'));

    await expect(createSchedule(sandbox).catchUp(NOW)).resolves.toBeUndefined();
    expect(sandbox.reset).not.toHaveBeenCalled();
  });

  it('logs a skipped catch-up at debug level, not as an error', async () => {
    const sandbox = createSandbox(PAST);
    sandbox.reset.mockResolvedValue(SANDBOX_RESET_OUTCOME.SKIPPED);
    const debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await createSchedule(sandbox).catchUp(NOW);

    expect(debugSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    debugSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('starts the catch-up on bootstrap without waiting for it', () => {
    const sandbox = createSandbox(PAST);
    sandbox.getNextResetAt.mockReturnValue(new Promise(() => {}));

    expect(createSchedule(sandbox).onApplicationBootstrap()).toBeUndefined();
    expect(sandbox.getNextResetAt).toHaveBeenCalled();
  });
});
