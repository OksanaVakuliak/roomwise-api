import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { FinishLevel } from '../../../generated/prisma/enums';
import type { PricingDataService } from '../pricing-data/pricing-data.service';
import { BaseRatesService } from './base-rates.service';

const ADMIN_ID = 'admin-1';
const RATE_ID = 'rate-1';
const CURRENT_REVISION = 'revision-1';

function decimal(value: number) {
  return { toNumber: () => value };
}

function rateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RATE_ID,
    finishLevel: FinishLevel.ROUGH,
    areaFromSqm: decimal(15),
    areaToSqm: decimal(50),
    rateCentsPerSqm: 1500,
    revision: CURRENT_REVISION,
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    ...overrides,
  };
}

function rangeRow(
  id: string,
  from: number,
  to: number,
  finishLevel: FinishLevel = FinishLevel.ROUGH,
) {
  return rateRow({
    id,
    finishLevel,
    areaFromSqm: decimal(from),
    areaToSqm: decimal(to),
  });
}

function p2025() {
  return new Prisma.PrismaClientKnownRequestError('missing', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

function setup(rows: ReturnType<typeof rateRow>[] = []) {
  const baseRate = {
    findMany: vi.fn().mockResolvedValue(rows),
    findUnique: vi.fn().mockResolvedValue(rateRow()),
    findUniqueOrThrow: vi.fn().mockResolvedValue(rateRow()),
    create: vi.fn().mockResolvedValue(rateRow()),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue(rateRow()),
  };
  const executeRaw = vi.fn().mockResolvedValue(1);
  const client = { baseRate, $executeRaw: executeRaw };
  const prisma = {
    baseRate,
    $transaction: vi.fn((callback: (tx: typeof client) => unknown) =>
      callback(client),
    ),
  } as unknown as PrismaService;
  const pricingData = {
    invalidate: vi.fn(),
    get: vi.fn().mockResolvedValue({
      limits: { totalAreaSqm: { min: 15, max: 500 } },
    }),
  };
  const service = new BaseRatesService(
    prisma,
    pricingData as unknown as PricingDataService,
  );

  return { service, prisma, baseRate, executeRaw, pricingData };
}

const input = {
  finishLevel: FinishLevel.ROUGH,
  areaFromSqm: 50,
  areaToSqm: 100,
  rateCentsPerSqm: 1400,
};

describe('BaseRatesService.list', () => {
  it('maps rows to the admin shape', async () => {
    const { service } = setup([rangeRow('a', 15, 500)]);

    const result = await service.list();

    expect(result.items).toEqual([
      {
        id: 'a',
        finishLevel: FinishLevel.ROUGH,
        areaFromSqm: 15,
        areaToSqm: 500,
        rateCentsPerSqm: 1500,
        revision: CURRENT_REVISION,
        updatedAt: '2026-10-01T12:00:00.000Z',
        updatedBy: { id: ADMIN_ID, login: 'admin' },
      },
    ]);
  });

  it('reports a full gap for a finish level without ranges', async () => {
    const { service } = setup([rangeRow('a', 15, 500.01)]);

    const result = await service.list();

    expect(result.gaps).toEqual([
      { finishLevel: FinishLevel.PRE_FINISH, fromSqm: 15, toSqm: 500 },
    ]);
  });

  it('reports leading, inner and trailing gaps within the limits', async () => {
    const { service } = setup([
      rangeRow('a', 20, 50),
      rangeRow('b', 60, 100),
      rangeRow('c', 0, 500.01, FinishLevel.PRE_FINISH),
    ]);

    const result = await service.list();

    expect(result.gaps).toEqual([
      { finishLevel: FinishLevel.ROUGH, fromSqm: 15, toSqm: 20 },
      { finishLevel: FinishLevel.ROUGH, fromSqm: 50, toSqm: 60 },
      { finishLevel: FinishLevel.ROUGH, fromSqm: 100, toSqm: 500 },
    ]);
  });

  it('reports the maximum area as a gap when the last range ends at it', async () => {
    const { service } = setup([
      rangeRow('a', 15, 500),
      rangeRow('b', 15, 500.01, FinishLevel.PRE_FINISH),
    ]);

    const result = await service.list();

    expect(result.gaps).toEqual([
      { finishLevel: FinishLevel.ROUGH, fromSqm: 500, toSqm: 500 },
    ]);
  });

  it('treats adjacent half-open ranges as contiguous', async () => {
    const { service } = setup([
      rangeRow('a', 15, 100),
      rangeRow('b', 100, 600),
      rangeRow('c', 15, 500.01, FinishLevel.PRE_FINISH),
    ]);

    const result = await service.list();

    expect(result.gaps).toEqual([]);
  });
});

describe('BaseRatesService.create', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup([rangeRow('a', 15, 50)]);
  });

  it('takes the advisory lock, creates the row and invalidates the cache', async () => {
    const { service, baseRate, executeRaw, pricingData } = ctx;

    await service.create(input, ADMIN_ID);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(baseRate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ...input, updatedById: ADMIN_ID },
      }),
    );
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('allows a range that starts exactly where another ends', async () => {
    await expect(ctx.service.create(input, ADMIN_ID)).resolves.toBeDefined();
  });

  it('rejects an overlapping range with the conflicting one', async () => {
    const { service, baseRate, pricingData } = ctx;

    await expect(
      service.create({ ...input, areaFromSqm: 49.99 }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.RANGE_OVERLAP,
      params: { conflict: { id: 'a', areaFromSqm: 15, areaToSqm: 50 } },
    });
    expect(baseRate.create).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('checks overlap only within the same finish level', async () => {
    const { service, baseRate } = ctx;
    baseRate.findMany.mockResolvedValue([]);

    await service.create(
      { ...input, finishLevel: FinishLevel.PRE_FINISH, areaFromSqm: 20 },
      ADMIN_ID,
    );

    expect(baseRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { finishLevel: FinishLevel.PRE_FINISH },
      }),
    );
  });
});

describe('BaseRatesService.update', () => {
  it('updates with the revision check and invalidates the cache', async () => {
    const { service, baseRate, pricingData } = setup();

    await service.update(
      RATE_ID,
      { rateCentsPerSqm: 1700, revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(baseRate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RATE_ID, revision: CURRENT_REVISION },
        data: expect.objectContaining({
          rateCentsPerSqm: 1700,
          areaFromSqm: 15,
          areaToSqm: 50,
          updatedById: ADMIN_ID,
        }),
      }),
    );
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale revision before checking overlap', async () => {
    const { service, baseRate } = setup();

    await expect(
      service.update(RATE_ID, { revision: 'old' }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: CURRENT_REVISION },
    });
    expect(baseRate.findMany).not.toHaveBeenCalled();
    expect(baseRate.updateMany).not.toHaveBeenCalled();
  });

  it('reports a missing row', async () => {
    const { service, baseRate } = setup();
    baseRate.findUnique.mockResolvedValue(null);

    await expect(
      service.update(RATE_ID, { revision: CURRENT_REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('rejects a merged range that is empty', async () => {
    const { service, baseRate } = setup();

    await expect(
      service.update(
        RATE_ID,
        { areaFromSqm: 50, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
    expect(baseRate.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an overlap with another row and ignores the row itself', async () => {
    const { service, baseRate } = setup();
    baseRate.findMany.mockResolvedValue([rangeRow('other', 50, 100)]);

    await expect(
      service.update(
        RATE_ID,
        { areaToSqm: 60, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.RANGE_OVERLAP,
      params: { conflict: { id: 'other', areaFromSqm: 50, areaToSqm: 100 } },
    });
    expect(baseRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { finishLevel: FinishLevel.ROUGH, id: { not: RATE_ID } },
      }),
    );
  });

  it('reports a stale revision when the guarded write matches no row', async () => {
    const { service, baseRate } = setup();
    baseRate.updateMany.mockResolvedValue({ count: 0 });
    baseRate.findUnique
      .mockResolvedValueOnce(rateRow())
      .mockResolvedValueOnce({ revision: 'newer' });

    await expect(
      service.update(RATE_ID, { revision: CURRENT_REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: 'newer' },
    });
  });
});

describe('BaseRatesService.remove', () => {
  it('deletes the row and invalidates the cache', async () => {
    const { service, baseRate, pricingData } = setup();

    await service.remove(RATE_ID);

    expect(baseRate.delete).toHaveBeenCalledWith({ where: { id: RATE_ID } });
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('reports a missing row', async () => {
    const { service, baseRate, pricingData } = setup();
    baseRate.delete.mockRejectedValue(p2025());

    await expect(service.remove(RATE_ID)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });
});
