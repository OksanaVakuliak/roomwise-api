import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { CoefficientsReadService } from './coefficients-read.service';

function createService(rows: { key: string }[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { coefficient: { findMany } } as unknown as PrismaService;

  return { service: new CoefficientsReadService(prisma), findMany };
}

describe('CoefficientsReadService', () => {
  it('returns only the keys that exist', async () => {
    const { service, findMany } = createService([{ key: 'a' }]);

    const result = await service.existingKeys(['a', 'b']);

    expect(result).toEqual(new Set(['a']));
    expect(findMany).toHaveBeenCalledWith({
      where: { key: { in: ['a', 'b'] } },
      select: { key: true },
    });
  });

  it('queries each repeated key once', async () => {
    const { service, findMany } = createService([{ key: 'a' }]);

    await service.existingKeys(['a', 'a']);

    expect(findMany).toHaveBeenCalledWith({
      where: { key: { in: ['a'] } },
      select: { key: true },
    });
  });

  it('skips the query for an empty list', async () => {
    const { service, findMany } = createService([]);

    const result = await service.existingKeys([]);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
