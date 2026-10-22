import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const KEY = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';

function lookupOf(row: unknown) {
  return { key: KEY, requestHash: 'hash', row };
}

function conflict() {
  return new AppError(ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT);
}

function setup(
  options: {
    lookup?: ReturnType<typeof lookupOf> | null;
    found?: unknown;
  } = {},
) {
  const request: Record<string, unknown> = { body: { a: 1 } };
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
    lookup: vi.fn().mockResolvedValue(options.lookup ?? null),
    find: vi.fn().mockResolvedValue(options.found ?? null),
    replay: vi.fn().mockResolvedValue({ status: 201, body: { id: 'first' } }),
  };
  const next: CallHandler = { handle: vi.fn(() => of('fresh')) };
  const interceptor = new IdempotencyInterceptor(reflector, service as never);

  return { interceptor, context, request, response, service, next };
}

describe('IdempotencyInterceptor', () => {
  it('rejects a missing or invalid key with IDEMPOTENCY_KEY_REQUIRED', async () => {
    const { interceptor, context, request, next, service } = setup({
      lookup: null,
    });

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof AppError &&
        error.code === ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
    );
    expect(service.lookup).toHaveBeenCalledWith(request, IdempotencyScope.SAVE);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('passes the context to the handler on a first request', async () => {
    const { interceptor, context, request, next, response } = setup({
      lookup: lookupOf(null),
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

  it('rejects a reused key with a different request', async () => {
    const { interceptor, context, next, service } = setup({
      lookup: lookupOf({ requestHash: 'other' }),
    });

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof AppError &&
        error.code === ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    expect(service.replay).not.toHaveBeenCalled();
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('replays the first response without running the handler', async () => {
    const row = { requestHash: 'hash' };
    const { interceptor, context, request, next, response, service } = setup({
      lookup: lookupOf(row),
    });

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).resolves.toEqual({ id: 'first' });
    expect(service.replay).toHaveBeenCalledWith(row, request);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(next.handle).not.toHaveBeenCalled();
  });

  describe('when the handler loses a concurrent first request', () => {
    it('replays the row stored by the winner', async () => {
      const stored = { requestHash: 'hash' };
      const { interceptor, context, request, next, response, service } = setup({
        lookup: lookupOf(null),
        found: stored,
      });
      vi.mocked(next.handle).mockReturnValue(throwError(() => conflict()));

      await expect(
        lastValueFrom(interceptor.intercept(context, next)),
      ).resolves.toEqual({ id: 'first' });
      expect(service.find).toHaveBeenCalledWith(IdempotencyScope.SAVE, KEY);
      expect(service.replay).toHaveBeenCalledWith(stored, request);
      expect(response.status).toHaveBeenCalledWith(201);
    });

    it('rejects when the winner stored a different request', async () => {
      const { interceptor, context, next, service } = setup({
        lookup: lookupOf(null),
        found: { requestHash: 'other' },
      });
      vi.mocked(next.handle).mockReturnValue(throwError(() => conflict()));

      await expect(
        lastValueFrom(interceptor.intercept(context, next)),
      ).rejects.toSatisfy(
        (error) =>
          error instanceof AppError &&
          error.code === ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      );
      expect(service.replay).not.toHaveBeenCalled();
    });

    it('rethrows the original error when no row is stored', async () => {
      const original = conflict();
      const { interceptor, context, next } = setup({ lookup: lookupOf(null) });
      vi.mocked(next.handle).mockReturnValue(throwError(() => original));

      await expect(
        lastValueFrom(interceptor.intercept(context, next)),
      ).rejects.toBe(original);
    });
  });

  it.each([
    ['an unrelated AppError', new AppError(ERROR_CODES.IDEMPOTENCY_KEY_REUSED)],
    ['a plain error', new Error('boom')],
  ])('passes %s from the handler through unchanged', async (_name, failure) => {
    const { interceptor, context, next, service } = setup({
      lookup: lookupOf(null),
    });
    vi.mocked(next.handle).mockReturnValue(throwError(() => failure));

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(failure);
    expect(service.find).not.toHaveBeenCalled();
  });
});
