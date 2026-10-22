import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IdempotencyReplayCheck } from './idempotency-replay.check';

const KEY = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';

function setup(options: {
  header?: string;
  scope?: IdempotencyScope;
  row?: { requestHash: string } | null;
}) {
  const context = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        body: { a: 1 },
        header: () => options.header,
      }),
    }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  vi.spyOn(reflector, 'get').mockReturnValue(options.scope);
  const service = {
    hashRequest: vi.fn().mockReturnValue('hash'),
    find: vi.fn().mockResolvedValue(options.row ?? null),
  };

  return {
    context,
    service,
    check: new IdempotencyReplayCheck(reflector, service as never),
  };
}

describe('IdempotencyReplayCheck', () => {
  it('is a replay when the stored hash matches', async () => {
    const { check, context, service } = setup({
      header: KEY,
      scope: IdempotencyScope.SAVE,
      row: { requestHash: 'hash' },
    });

    await expect(check.isReplay(context)).resolves.toBe(true);
    expect(service.find).toHaveBeenCalledWith(IdempotencyScope.SAVE, KEY);
  });

  it('is not a replay when the body differs', async () => {
    const { check, context } = setup({
      header: KEY,
      scope: IdempotencyScope.SAVE,
      row: { requestHash: 'other' },
    });

    await expect(check.isReplay(context)).resolves.toBe(false);
  });

  it('is not a replay when no row is stored', async () => {
    const { check, context } = setup({
      header: KEY,
      scope: IdempotencyScope.SAVE,
    });

    await expect(check.isReplay(context)).resolves.toBe(false);
  });

  it.each([undefined, 'not-a-uuid'])(
    'is not a replay for header %s',
    async (header) => {
      const { check, context, service } = setup({
        header,
        scope: IdempotencyScope.SAVE,
      });

      await expect(check.isReplay(context)).resolves.toBe(false);
      expect(service.find).not.toHaveBeenCalled();
    },
  );

  it('is not a replay for a route without idempotency', async () => {
    const { check, context, service } = setup({ header: KEY });

    await expect(check.isReplay(context)).resolves.toBe(false);
    expect(service.find).not.toHaveBeenCalled();
  });
});
