import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

function createResponse(): { setHeader: ReturnType<typeof vi.fn> } {
  return { setHeader: vi.fn() };
}

describe('HealthController', () => {
  it('sets Cache-Control to no-store and returns the health status', async () => {
    const healthService = {
      check: vi.fn().mockResolvedValue({ service: 'up', database: 'up' }),
    } as unknown as HealthService;
    const controller = new HealthController(healthService);
    const response = createResponse();

    const result = await controller.check(response as unknown as Response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(result).toEqual({ service: 'up', database: 'up' });
  });
});
