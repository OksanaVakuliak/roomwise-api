import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client';
import { CoefficientsReadService } from './coefficients-read.service';

function createTx(rows: { key: string }[]) {
  const $queryRaw = vi.fn().mockResolvedValue(rows);

  return {
    tx: { $queryRaw } as unknown as Prisma.TransactionClient,
    $queryRaw,
  };
}

describe('CoefficientsReadService', () => {
  it('returns only the keys that exist', async () => {
    const { tx, $queryRaw } = createTx([{ key: 'a' }]);

    const result = await new CoefficientsReadService().lockExistingKeys(tx, [
      'a',
      'b',
    ]);

    expect(result).toEqual(new Set(['a']));
    expect($queryRaw).toHaveBeenCalledTimes(1);
    expect(String($queryRaw.mock.calls[0][0].join(''))).toContain('FOR SHARE');
  });

  it('queries each repeated key once', async () => {
    const { tx, $queryRaw } = createTx([{ key: 'a' }]);

    await new CoefficientsReadService().lockExistingKeys(tx, ['a', 'a']);

    expect($queryRaw.mock.calls[0][1]).toEqual(['a']);
  });

  it('skips the query for an empty list', async () => {
    const { tx, $queryRaw } = createTx([]);

    const result = await new CoefficientsReadService().lockExistingKeys(tx, []);

    expect(result.size).toBe(0);
    expect($queryRaw).not.toHaveBeenCalled();
  });
});
