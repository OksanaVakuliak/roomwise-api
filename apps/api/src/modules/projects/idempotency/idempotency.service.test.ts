import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { Prisma } from '../../../generated/prisma/client';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IdempotencyService } from './idempotency.service';

const KEY = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';
const RESULT_ID = '5a1f0a52-2d0e-4b3a-8c52-7e1d3f6f6a02';
const NOW = new Date('2026-10-22T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function createService() {
  const prisma = { idempotencyKey: { findUnique: vi.fn() } };
  const clock = { now: () => NOW };
  const service = new IdempotencyService(prisma as never, clock as never);

  return { prisma, service };
}

function createRequest(
  parts: { params?: object; query?: object; body?: unknown; key?: string } = {},
) {
  return {
    params: parts.params ?? {},
    query: parts.query ?? {},
    body: 'body' in parts ? parts.body : { a: 1 },
    header: vi.fn((name: string) =>
      name === 'Idempotency-Key' ? parts.key : undefined,
    ),
  } as unknown as Request;
}

function createTx(
  create: ReturnType<typeof vi.fn>,
  deleteMany = vi.fn().mockResolvedValue({ count: 0 }),
) {
  return { idempotencyKey: { create, deleteMany } } as never;
}

const params = {
  scope: IdempotencyScope.SAVE,
  key: KEY,
  requestHash: 'hash',
  resultId: RESULT_ID,
};

describe('IdempotencyService', () => {
  it('hashes equal requests identically regardless of key order', () => {
    const { service } = createService();
    const first = createRequest({ body: { a: 1, b: { c: 2, d: [3] } } });
    const second = createRequest({ body: { b: { d: [3], c: 2 }, a: 1 } });

    expect(service.hashRequest(first)).toBe(service.hashRequest(second));
    expect(service.hashRequest(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes a different body differently', () => {
    const { service } = createService();

    expect(service.hashRequest(createRequest({ body: { a: 1 } }))).not.toBe(
      service.hashRequest(createRequest({ body: { a: 2 } })),
    );
  });

  it('hashes the same body differently for different route params', () => {
    const { service } = createService();

    expect(
      service.hashRequest(createRequest({ params: { id: '1' } })),
    ).not.toBe(service.hashRequest(createRequest({ params: { id: '2' } })));
  });

  it('hashes the same body differently for different queries', () => {
    const { service } = createService();

    expect(
      service.hashRequest(createRequest({ query: { page: '1' } })),
    ).not.toBe(service.hashRequest(createRequest({ query: { page: '2' } })));
  });

  it('treats a missing body as null', () => {
    const { service } = createService();

    expect(service.hashRequest(createRequest({ body: undefined }))).toBe(
      service.hashRequest(createRequest({ body: null })),
    );
  });

  it.each([undefined, 'not-a-uuid'])(
    'looks up nothing for header %s',
    async (key) => {
      const { prisma, service } = createService();

      await expect(
        service.lookup(createRequest({ key }), IdempotencyScope.SAVE),
      ).resolves.toBeNull();
      expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
    },
  );

  it('looks up the key, the request hash and the stored row', async () => {
    const { prisma, service } = createService();
    const row = { ...params, createdAt: NOW };
    prisma.idempotencyKey.findUnique.mockResolvedValue(row);
    const req = createRequest({ key: KEY });

    await expect(service.lookup(req, IdempotencyScope.SAVE)).resolves.toEqual({
      key: KEY,
      requestHash: service.hashRequest(req),
      row,
    });
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
      where: { scope_key: { scope: IdempotencyScope.SAVE, key: KEY } },
    });
  });

  it('returns a null row when nothing is stored', async () => {
    const { prisma, service } = createService();
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);

    await expect(
      service.lookup(createRequest({ key: KEY }), IdempotencyScope.SAVE),
    ).resolves.toMatchObject({ key: KEY, row: null });
  });

  it('reads the database once per request object', async () => {
    const { prisma, service } = createService();
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    const req = createRequest({ key: KEY });

    const [first, second] = await Promise.all([
      service.lookup(req, IdempotencyScope.SAVE),
      service.lookup(req, IdempotencyScope.SAVE),
    ]);

    expect(second).toBe(first);
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledTimes(1);

    await service.lookup(createRequest({ key: KEY }), IdempotencyScope.SAVE);
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledTimes(2);
  });

  it('finds a row by scope and key', async () => {
    const { prisma, service } = createService();
    const row = { ...params, createdAt: NOW };
    prisma.idempotencyKey.findUnique.mockResolvedValue(row);

    await expect(service.find(IdempotencyScope.SAVE, KEY)).resolves.toBe(row);
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
      where: { scope_key: { scope: IdempotencyScope.SAVE, key: KEY } },
    });
  });

  it('ignores a row older than 24 hours', async () => {
    const { prisma, service } = createService();
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      ...params,
      createdAt: new Date(NOW.getTime() - DAY_MS - 1),
    });

    await expect(service.find(IdempotencyScope.SAVE, KEY)).resolves.toBeNull();
  });

  it('removes an expired row before recording the key again', async () => {
    const { service } = createService();
    const create = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });

    await service.record(createTx(create, deleteMany), params);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        scope: IdempotencyScope.SAVE,
        key: KEY,
        createdAt: { lt: new Date(NOW.getTime() - DAY_MS) },
      },
    });
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
  });

  it('records a key inside the given transaction', async () => {
    const { service } = createService();
    const create = vi.fn().mockResolvedValue(undefined);

    await service.record(createTx(create), { ...params, fakeLeadNumber: 7 });

    expect(create).toHaveBeenCalledWith({
      data: { ...params, fakeLeadNumber: 7 },
    });
  });

  it('stores a null lead number by default', async () => {
    const { service } = createService();
    const create = vi.fn().mockResolvedValue(undefined);

    await service.record(createTx(create), params);

    expect(create).toHaveBeenCalledWith({
      data: { ...params, fakeLeadNumber: null },
    });
  });

  it('maps a primary key collision to IDEMPOTENCY_KEY_CONFLICT', async () => {
    const { service } = createService();
    const collision = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = vi.fn().mockRejectedValue(collision);

    await expect(service.record(createTx(create), params)).rejects.toSatisfy(
      (error) =>
        error instanceof AppError &&
        error.code === ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT,
    );
  });

  it('rethrows other errors', async () => {
    const { service } = createService();
    const failure = new Error('boom');
    const create = vi.fn().mockRejectedValue(failure);

    await expect(service.record(createTx(create), params)).rejects.toBe(
      failure,
    );
  });

  it('replays through the loader registered for the scope', async () => {
    const { service } = createService();
    const loader = vi.fn().mockResolvedValue({ id: 1 });
    service.registerLoader(IdempotencyScope.SAVE, loader);
    const row = { ...params, fakeLeadNumber: null, createdAt: new Date() };
    const req = createRequest();

    await expect(service.replay(row, req)).resolves.toEqual({ id: 1 });
    expect(loader).toHaveBeenCalledWith(row, req);
  });

  it('fails when no loader is registered for the scope', async () => {
    const { service } = createService();
    const row = {
      ...params,
      scope: IdempotencyScope.LEAD,
      fakeLeadNumber: null,
      createdAt: new Date(),
    };

    await expect(service.replay(row, createRequest())).rejects.toThrow(/LEAD/);
  });
});
