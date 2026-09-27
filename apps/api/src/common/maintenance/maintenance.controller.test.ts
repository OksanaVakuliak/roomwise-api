import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../clock/clock';
import { MaintenanceController } from './maintenance.controller';
import type { MaintenanceRegistry } from './maintenance-registry';

describe('MaintenanceController', () => {
  it('runs due tasks at the clock time and returns their statuses', async () => {
    const now = new Date('2026-09-27T00:30:00.000Z');
    const registry = {
      runDue: vi.fn().mockResolvedValue([{ name: 'task', status: 'SUCCESS' }]),
    } as unknown as MaintenanceRegistry;
    const controller = new MaintenanceController(registry, {
      now: () => now,
    } as Clock);

    const result = await controller.run();

    expect(result).toEqual({ tasks: [{ name: 'task', status: 'SUCCESS' }] });
    expect(registry.runDue).toHaveBeenCalledWith(now);
  });
});
