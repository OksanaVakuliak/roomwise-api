import { describe, expect, it, vi } from 'vitest';
import { MaintenanceController } from './maintenance.controller';
import type { MaintenanceRegistry } from './maintenance-registry';

describe('MaintenanceController', () => {
  it('runs due tasks and returns their statuses', async () => {
    const registry = {
      runDue: vi.fn().mockResolvedValue([{ name: 'task', status: 'SUCCESS' }]),
    } as unknown as MaintenanceRegistry;
    const controller = new MaintenanceController(registry);

    const result = await controller.run();

    expect(result).toEqual({ tasks: [{ name: 'task', status: 'SUCCESS' }] });
    expect(registry.runDue).toHaveBeenCalledWith(expect.any(Date));
  });
});
