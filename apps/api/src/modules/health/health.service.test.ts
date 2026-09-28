import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { HealthService } from './health.service';

const DATABASE_CHECK_TIMEOUT_MS = 2000;

function createPrisma(queryRaw: unknown): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('reports the database as up when the query succeeds', async () => {
    const prisma = createPrisma(vi.fn().mockResolvedValue([{ '?column?': 1 }]));
    const service = new HealthService(prisma);

    await expect(service.check()).resolves.toEqual({
      service: 'up',
      database: 'up',
    });
  });

  it('reports the database as down when the query throws', async () => {
    const prisma = createPrisma(vi.fn().mockRejectedValue(new Error('boom')));
    const service = new HealthService(prisma);

    await expect(service.check()).resolves.toEqual({
      service: 'up',
      database: 'down',
    });
  });

  it('reports the database as down when the query hangs past the timeout', async () => {
    vi.useFakeTimers();

    try {
      const prisma = createPrisma(
        vi.fn().mockReturnValue(new Promise(() => {})),
      );
      const service = new HealthService(prisma);

      const result = service.check();
      await vi.advanceTimersByTimeAsync(DATABASE_CHECK_TIMEOUT_MS);

      await expect(result).resolves.toEqual({
        service: 'up',
        database: 'down',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
