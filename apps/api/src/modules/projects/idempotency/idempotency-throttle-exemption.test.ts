import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IdempotencyThrottleExemption } from './idempotency-throttle-exemption';

const KEY = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';

function lookupOf(row: { requestHash: string } | null) {
  return { key: KEY, requestHash: 'hash', row };
}

function setup(options: {
  scope?: IdempotencyScope;
  lookup?: ReturnType<typeof lookupOf> | null;
}) {
  const request = { body: { a: 1 } };
  const context = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  vi.spyOn(reflector, 'get').mockReturnValue(options.scope);
  const service = {
    lookup: vi.fn().mockResolvedValue(options.lookup ?? null),
  };

  return {
    context,
    request,
    service,
    exemption: new IdempotencyThrottleExemption(reflector, service as never),
  };
}

describe('IdempotencyThrottleExemption', () => {
  it('is exempt when the stored hash matches', async () => {
    const { exemption, context, request, service } = setup({
      scope: IdempotencyScope.SAVE,
      lookup: lookupOf({ requestHash: 'hash' }),
    });

    await expect(exemption.isExempt(context)).resolves.toBe(true);
    expect(service.lookup).toHaveBeenCalledWith(request, IdempotencyScope.SAVE);
  });

  it('is not exempt when the request differs from the stored one', async () => {
    const { exemption, context } = setup({
      scope: IdempotencyScope.SAVE,
      lookup: lookupOf({ requestHash: 'other' }),
    });

    await expect(exemption.isExempt(context)).resolves.toBe(false);
  });

  it('is not exempt when no row is stored', async () => {
    const { exemption, context } = setup({
      scope: IdempotencyScope.SAVE,
      lookup: lookupOf(null),
    });

    await expect(exemption.isExempt(context)).resolves.toBe(false);
  });

  it('is exempt without a valid key because the request will be rejected', async () => {
    const { exemption, context } = setup({
      scope: IdempotencyScope.SAVE,
      lookup: null,
    });

    await expect(exemption.isExempt(context)).resolves.toBe(true);
  });

  it('is not exempt for a route without idempotency', async () => {
    const { exemption, context, service } = setup({});

    await expect(exemption.isExempt(context)).resolves.toBe(false);
    expect(service.lookup).not.toHaveBeenCalled();
  });
});
