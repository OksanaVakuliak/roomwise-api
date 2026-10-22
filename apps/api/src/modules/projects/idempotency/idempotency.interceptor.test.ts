import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const KEY = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';

function setup(options: { header?: string; row?: unknown } = {}) {
  const request: Record<string, unknown> = {
    body: { a: 1 },
    header: (name: string) =>
      name === 'Idempotency-Key' ? options.header : undefined,
  };
  const response = { status: vi.fn() };
  const handler = () => undefined;
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  vi.spyOn(reflector, 'get').mockImplementation((metadataKey) =>
    metadataKey === IDEMPOTENCY_SCOPE_KEY ? IdempotencyScope.SAVE : undefined,
  );
  const service = {
    hashRequest: vi.fn().mockReturnValue('hash'),
    find: vi.fn().mockResolvedValue(options.row ?? null),
    replay: vi.fn().mockResolvedValue({ status: 201, body: { id: 'first' } }),
  };
  const next: CallHandler = { handle: vi.fn(() => of('fresh')) };
  const interceptor = new IdempotencyInterceptor(reflector, service as never);

  return { interceptor, context, request, response, service, next };
}

describe('IdempotencyInterceptor', () => {
  it.each([undefined, 'not-a-uuid'])(
    'rejects header %s with IDEMPOTENCY_KEY_REQUIRED',
    (header) => {
      const { interceptor, context, next, service } = setup({ header });

      expect(() => interceptor.intercept(context, next)).toThrow(
        expect.objectContaining({
          code: ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        }),
      );
      expect(service.find).not.toHaveBeenCalled();
      expect(next.handle).not.toHaveBeenCalled();
    },
  );

  it('passes the context to the handler on a first request', async () => {
    const { interceptor, context, request, next, response } = setup({
      header: KEY,
    });

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).resolves.toBe('fresh');
    expect(request.idempotency).toEqual({
      scope: IdempotencyScope.SAVE,
      key: KEY,
      requestHash: 'hash',
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different body', async () => {
    const { interceptor, context, next } = setup({
      header: KEY,
      row: { requestHash: 'other' },
    });

    const result = lastValueFrom(interceptor.intercept(context, next));

    await expect(result).rejects.toSatisfy(
      (error) =>
        error instanceof AppError &&
        error.code === ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('replays the first response without running the handler', async () => {
    const row = { requestHash: 'hash' };
    const { interceptor, context, next, response, service } = setup({
      header: KEY,
      row,
    });

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).resolves.toEqual({ id: 'first' });
    expect(service.replay).toHaveBeenCalledWith(row);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(next.handle).not.toHaveBeenCalled();
  });
});
