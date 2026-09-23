import type { DiscoveryService } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceRegistry } from './maintenance-registry';
import type { MaintenanceTask } from './maintenance-task.interface';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

function createDiscovery(instances: unknown[]): DiscoveryService {
  return {
    getProviders: vi
      .fn()
      .mockReturnValue(
        instances.map((instance) => ({ instance, name: 'test' })),
      ),
  } as unknown as DiscoveryService;
}

function createTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    name: 'task',
    isDue: vi.fn().mockReturnValue(true),
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('MaintenanceRegistry', () => {
  it('skips tasks that are not due', async () => {
    const task = createTask({ isDue: vi.fn().mockReturnValue(false) });
    const registry = new MaintenanceRegistry(createDiscovery([task]));

    const results = await registry.runDue(new Date());

    expect(results).toEqual([{ name: 'task', status: 'SKIPPED_NOT_DUE' }]);
    expect(task.run).not.toHaveBeenCalled();
  });

  it('reports success when a due task runs without error', async () => {
    const task = createTask();
    const registry = new MaintenanceRegistry(createDiscovery([task]));

    const results = await registry.runDue(new Date());

    expect(results).toEqual([{ name: 'task', status: 'SUCCESS' }]);
  });

  it('reports failure and continues with the next task when run throws', async () => {
    const failing = createTask({
      name: 'failing',
      run: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const succeeding = createTask({ name: 'succeeding' });
    const registry = new MaintenanceRegistry(
      createDiscovery([failing, succeeding]),
    );

    const results = await registry.runDue(new Date());

    expect(results).toEqual([
      { name: 'failing', status: 'FAILED' },
      { name: 'succeeding', status: 'SUCCESS' },
    ]);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reports failure and continues with the next task when isDue throws synchronously', async () => {
    const failing = createTask({
      name: 'failing',
      isDue: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const succeeding = createTask({ name: 'succeeding' });
    const registry = new MaintenanceRegistry(
      createDiscovery([failing, succeeding]),
    );

    const results = await registry.runDue(new Date());

    expect(results).toEqual([
      { name: 'failing', status: 'FAILED' },
      { name: 'succeeding', status: 'SUCCESS' },
    ]);
    expect(failing.run).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reports failure and continues with the next task when isDue rejects', async () => {
    const failing = createTask({
      name: 'failing',
      isDue: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const succeeding = createTask({ name: 'succeeding' });
    const registry = new MaintenanceRegistry(
      createDiscovery([failing, succeeding]),
    );

    const results = await registry.runDue(new Date());

    expect(results).toEqual([
      { name: 'failing', status: 'FAILED' },
      { name: 'succeeding', status: 'SUCCESS' },
    ]);
    expect(failing.run).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('throws at discovery time when task names collide', () => {
    const registry = new MaintenanceRegistry(
      createDiscovery([
        createTask({ name: 'same' }),
        createTask({ name: 'same' }),
      ]),
    );

    expect(() => registry.tasks()).toThrow(/Duplicate maintenance task name/);
  });

  it('throws when a discovered provider does not implement the contract', () => {
    const registry = new MaintenanceRegistry(createDiscovery([{ nope: true }]));

    expect(() => registry.tasks()).toThrow(/MaintenanceTask contract/);
  });
});
