import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { Prisma } from '../../../generated/prisma/client';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IdempotencyService } from './idempotency.service';

const KEY = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';
const RESULT_ID = '5a1f0a52-2d0e-4b3a-8c52-7e1d3f6f6a02';

function createService() {
  const prisma = { idempotencyKey: { findUnique: vi.fn() } };
  const service = new IdempotencyService(prisma as never);

  return { prisma, service };
}

function createTx(create: ReturnType<typeof vi.fn>) {
  return { idempotencyKey: { create } } as never;
}

const params = {
  scope: IdempotencyScope.SAVE,
  key: KEY,
  requestHash: 'hash',
  resultId: RESULT_ID,
};

describe('IdempotencyService', () => {
  it('hashes equal bodies identically regardless of key order', () => {
    const { service } = createService();

    expect(service.hashRequest({ a: 1, b: { c: 2, d: [3] } })).toBe(
      service.hashRequest({ b: { d: [3], c: 2 }, a: 1 }),
    );
    expect(service.hashRequest({ a: 1 })).not.toBe(
      service.hashRequest({ a: 2 }),
    );
    expect(service.hashRequest(undefined)).toBe(service.hashRequest(null));
    expect(service.hashRequest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('finds a row by scope and key', async () => {
    const { prisma, service } = createService();
    const row = { ...params };
    prisma.idempotencyKey.findUnique.mockResolvedValue(row);

    await expect(service.find(IdempotencyScope.SAVE, KEY)).resolves.toBe(row);
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
      where: { scope_key: { scope: IdempotencyScope.SAVE, key: KEY } },
    });
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
    const loader = vi.fn().mockResolvedValue({ status: 201, body: { id: 1 } });
    service.registerLoader(IdempotencyScope.SAVE, loader);
    const row = { ...params, fakeLeadNumber: null, createdAt: new Date() };

    await expect(service.replay(row)).resolves.toEqual({
      status: 201,
      body: { id: 1 },
    });
    expect(loader).toHaveBeenCalledWith(row);
  });

  it('fails when no loader is registered for the scope', async () => {
    const { service } = createService();
    const row = {
      ...params,
      scope: IdempotencyScope.LEAD,
      fakeLeadNumber: null,
      createdAt: new Date(),
    };

    await expect(service.replay(row)).rejects.toThrow(/LEAD/);
  });
});
