import { describe, expect, it, vi } from 'vitest';
import type { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateRefreshTask } from './exchange-rate.task';

const NOW = new Date('2026-09-14T22:30:00.000Z');

function createTask(isDue: boolean) {
  const service = {
    isRefreshDue: vi.fn().mockResolvedValue(isDue),
    refresh: vi.fn().mockResolvedValue(undefined),
  };

  return {
    service,
    task: new ExchangeRateRefreshTask(
      service as unknown as ExchangeRateService,
    ),
  };
}

describe('ExchangeRateRefreshTask', () => {
  it('is named exchange-rate-refresh', () => {
    expect(createTask(true).task.name).toBe('exchange-rate-refresh');
  });

  it('delegates the due check to the service', async () => {
    const { task, service } = createTask(true);

    expect(await task.isDue(NOW)).toBe(true);
    expect(service.isRefreshDue).toHaveBeenCalledWith(NOW);
  });

  it('is not due when the service says so', async () => {
    expect(await createTask(false).task.isDue(NOW)).toBe(false);
  });

  it('refreshes at the given instant', async () => {
    const { task, service } = createTask(true);

    await task.run(NOW);

    expect(service.refresh).toHaveBeenCalledWith(NOW);
  });

  it('lets a failed refresh reach the registry', async () => {
    const { task, service } = createTask(true);
    service.refresh.mockRejectedValue(new Error('NBU down'));

    await expect(task.run(NOW)).rejects.toThrow('NBU down');
  });
});
