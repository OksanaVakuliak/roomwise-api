import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../common/clock/clock';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { RateSource } from '../../../generated/prisma/enums';
import { ExchangeRateService } from './exchange-rate.service';
import { NBU_ERROR_KINDS, type NbuClient, NbuError } from './nbu.client';

const NOW = new Date('2026-09-14T09:00:00.000Z');
const HOUR_MS = 3_600_000;

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function rateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rate-1',
    source: RateSource.NBU,
    rate: decimal('44.5483'),
    effectiveDate: new Date('2026-09-14T00:00:00.000Z'),
    fetchedAt: new Date(NOW.getTime() - HOUR_MS),
    createdById: null,
    ...overrides,
  };
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    manualRateId: null,
    manualRate: null,
    lastNbuSuccessDate: new Date('2026-09-14T00:00:00.000Z'),
    lastNbuAttemptAt: new Date(NOW.getTime() - HOUR_MS),
    lastNbuError: null,
    ...overrides,
  };
}

interface Fixture {
  settings?: ReturnType<typeof settingsRow>;
  official?: ReturnType<typeof rateRow> | null;
  now?: Date;
}

function setup(fixture: Fixture = {}) {
  const settings = fixture.settings ?? settingsRow();
  const official =
    fixture.official === undefined ? rateRow() : fixture.official;
  const clock = { now: vi.fn(() => fixture.now ?? NOW) };
  const prisma = {
    pricingSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
      update: vi.fn().mockResolvedValue(settings),
    },
    exchangeRate: {
      findFirst: vi.fn().mockResolvedValue(official),
      create: vi.fn().mockResolvedValue(rateRow({ id: 'created' })),
      update: vi.fn().mockResolvedValue(official),
      delete: vi.fn().mockResolvedValue(null),
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ manual_rate_id: settings.manualRateId }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const nbu = {
    fetchUsdRate: vi.fn().mockResolvedValue({
      rate: '44.5483',
      effectiveDate: new Date('2026-09-14T00:00:00.000Z'),
    }),
  };
  const service = new ExchangeRateService(
    prisma as unknown as PrismaService,
    nbu as unknown as NbuClient,
    clock as unknown as Clock,
  );
  const changes = vi.fn();
  service.changes$.subscribe(changes);

  return { service, prisma, nbu, clock, changes };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('ExchangeRateService active rate', () => {
  it('is null without any rate', async () => {
    const { service } = setup({ official: null });

    expect(await service.activeRate()).toBeNull();
  });

  it('uses the latest official rate', async () => {
    const { service, prisma } = setup();

    expect(await service.activeRate()).toEqual({
      rate: '44.5483',
      date: '2026-09-14',
      source: RateSource.NBU,
    });
    expect(prisma.exchangeRate.findFirst).toHaveBeenCalledWith({
      where: { source: RateSource.NBU },
      orderBy: { effectiveDate: 'desc' },
    });
  });

  it('prefers the manual rate and keeps four decimals', async () => {
    const manual = rateRow({
      id: 'manual',
      source: RateSource.MANUAL,
      rate: decimal('45.1'),
      effectiveDate: new Date('2026-09-13T00:00:00.000Z'),
    });
    const { service } = setup({
      settings: settingsRow({ manualRateId: 'manual', manualRate: manual }),
    });

    expect(await service.activeRate()).toEqual({
      rate: '45.1000',
      date: '2026-09-13',
      source: RateSource.MANUAL,
    });
  });
});

describe('ExchangeRateService status', () => {
  it('reports a healthy official rate', async () => {
    const { service } = setup();

    expect(await service.status()).toEqual({
      active: { rate: '44.5483', date: '2026-09-14', source: 'NBU' },
      official: { rate: '44.5483', date: '2026-09-14' },
      manual: null,
      lastSuccessfulFetchDate: '2026-09-14',
      lastAttemptAt: new Date(NOW.getTime() - HOUR_MS).toISOString(),
      lastError: null,
      staleSince: null,
    });
  });

  it('marks the official rate stale since the last successful fetch', async () => {
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: new Date('2026-09-10T00:00:00.000Z'),
        lastNbuError: 'NBU responded with HTTP 500',
      }),
    });

    const status = await service.status();

    expect(status.lastError).toBe('NBU responded with HTTP 500');
    expect(status.staleSince).toBe('2026-09-10');
    expect(status.active?.source).toBe('NBU');
  });

  it('falls back to the official date when no fetch ever succeeded', async () => {
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: null,
        lastNbuError: 'down',
      }),
    });

    expect((await service.status()).staleSince).toBe('2026-09-14');
  });

  it('has no active rate and no stale date without data', async () => {
    const { service } = setup({
      official: null,
      settings: settingsRow({
        lastNbuSuccessDate: null,
        lastNbuAttemptAt: null,
      }),
    });

    expect(await service.status()).toMatchObject({
      active: null,
      official: null,
      staleSince: null,
    });
  });
});

describe('ExchangeRateService.isRefreshDue', () => {
  it('is not due once today in Kyiv already has a successful fetch', async () => {
    const { service } = setup();

    expect(await service.isRefreshDue(NOW)).toBe(false);
  });

  it('is due when the last success is from an earlier Kyiv day', async () => {
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: new Date('2026-09-13T00:00:00.000Z'),
        lastNbuAttemptAt: new Date('2026-09-13T09:00:00.000Z'),
      }),
    });

    expect(await service.isRefreshDue(NOW)).toBe(true);
  });

  it('is not due when the last attempt was under an hour ago', async () => {
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: new Date('2026-09-13T00:00:00.000Z'),
        lastNbuAttemptAt: new Date(NOW.getTime() - HOUR_MS + 1),
      }),
    });

    expect(await service.isRefreshDue(NOW)).toBe(false);
  });

  it('is due when the last attempt was exactly an hour ago', async () => {
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: new Date('2026-09-13T00:00:00.000Z'),
        lastNbuAttemptAt: new Date(NOW.getTime() - HOUR_MS),
      }),
    });

    expect(await service.isRefreshDue(NOW)).toBe(true);
  });

  it('is due when nothing was ever fetched', async () => {
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: null,
        lastNbuAttemptAt: null,
      }),
    });

    expect(await service.isRefreshDue(NOW)).toBe(true);
  });

  it('uses the Kyiv calendar day: 22:30 UTC in summer is already tomorrow', async () => {
    const lateEvening = new Date('2026-09-14T22:30:00.000Z');
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: new Date('2026-09-14T00:00:00.000Z'),
        lastNbuAttemptAt: new Date('2026-09-14T09:00:00.000Z'),
      }),
    });

    expect(await service.isRefreshDue(lateEvening)).toBe(true);
  });

  it('uses winter time in Kyiv: 21:30 UTC in December is still the same day', async () => {
    const winterEvening = new Date('2026-12-14T21:30:00.000Z');
    const { service } = setup({
      settings: settingsRow({
        lastNbuSuccessDate: new Date('2026-12-14T00:00:00.000Z'),
        lastNbuAttemptAt: new Date('2026-12-14T09:00:00.000Z'),
      }),
    });

    expect(await service.isRefreshDue(winterEvening)).toBe(false);
  });
});

describe('ExchangeRateService.refresh', () => {
  it('creates the official rate and records the success on the Kyiv date', async () => {
    const { service, prisma, changes } = setup({
      official: null,
      now: new Date('2026-09-14T22:30:00.000Z'),
    });

    await service.refresh(new Date('2026-09-14T22:30:00.000Z'));

    expect(prisma.exchangeRate.create).toHaveBeenCalledWith({
      data: {
        source: RateSource.NBU,
        rate: '44.5483',
        effectiveDate: new Date('2026-09-14T00:00:00.000Z'),
        fetchedAt: new Date('2026-09-14T22:30:00.000Z'),
      },
    });
    expect(prisma.pricingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        lastNbuSuccessDate: new Date('2026-09-15T00:00:00.000Z'),
        lastNbuAttemptAt: new Date('2026-09-14T22:30:00.000Z'),
        lastNbuError: null,
      },
    });
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('updates the row for an existing date and notifies only on a changed rate', async () => {
    const { service, prisma, nbu, changes } = setup();
    nbu.fetchUsdRate.mockResolvedValue({
      rate: '44.9000',
      effectiveDate: new Date('2026-09-14T00:00:00.000Z'),
    });

    await service.refresh(NOW);

    expect(prisma.exchangeRate.update).toHaveBeenCalledWith({
      where: { id: 'rate-1' },
      data: { rate: '44.9000', fetchedAt: NOW },
    });
    expect(prisma.exchangeRate.create).not.toHaveBeenCalled();
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the fetched rate equals the stored one', async () => {
    const { service, changes } = setup();

    await service.refresh(NOW);

    expect(changes).not.toHaveBeenCalled();
  });

  it('keeps the last rate and records the error on failure', async () => {
    const { service, prisma, nbu, changes } = setup();
    nbu.fetchUsdRate.mockRejectedValue(
      new NbuError(NBU_ERROR_KINDS.TIMEOUT, 'NBU did not respond'),
    );

    await expect(service.refresh(NOW)).rejects.toThrow('NBU did not respond');

    expect(prisma.pricingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastNbuAttemptAt: NOW, lastNbuError: 'NBU did not respond' },
    });
    expect(prisma.exchangeRate.create).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.update).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
  });

  it('records the error and backs off when storing the fetched rate fails', async () => {
    const { service, prisma, nbu, changes } = setup({
      official: rateRow({
        fetchedAt: new Date(NOW.getTime() - 27 * 3_600_000),
      }),
    });
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

    await expect(service.refresh(NOW)).rejects.toThrow('db down');

    expect(prisma.pricingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastNbuAttemptAt: NOW, lastNbuError: 'db down' },
    });
    expect(changes).not.toHaveBeenCalled();

    service.requestRefreshIfStale();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(nbu.fetchUsdRate).toHaveBeenCalledTimes(1);
  });

  it('still surfaces the NBU error when recording it fails', async () => {
    const { service, prisma, nbu } = setup();
    nbu.fetchUsdRate.mockRejectedValue(new Error('NBU down'));
    prisma.pricingSettings.update.mockRejectedValue(new Error('db down'));

    await expect(service.refresh(NOW)).rejects.toThrow('NBU down');
  });

  it('shares one request between concurrent refreshes', async () => {
    const { service, nbu } = setup();

    await Promise.all([service.refresh(NOW), service.refresh(NOW)]);

    expect(nbu.fetchUsdRate).toHaveBeenCalledTimes(1);
  });
});

describe('ExchangeRateService.requestRefreshIfStale', () => {
  it('does not fetch while the official rate is under 26 hours old', async () => {
    const { service, nbu } = setup({
      official: rateRow({ fetchedAt: new Date(NOW.getTime() - 25 * HOUR_MS) }),
    });

    service.requestRefreshIfStale();
    await flush();

    expect(nbu.fetchUsdRate).not.toHaveBeenCalled();
  });

  it('fetches in the background when the rate is older than 26 hours', async () => {
    const { service, nbu } = setup({
      official: rateRow({ fetchedAt: new Date(NOW.getTime() - 27 * HOUR_MS) }),
      settings: settingsRow({
        lastNbuAttemptAt: new Date(NOW.getTime() - 5 * HOUR_MS),
      }),
    });

    expect(service.requestRefreshIfStale()).toBeUndefined();
    await flush();

    expect(nbu.fetchUsdRate).toHaveBeenCalledTimes(1);
  });

  it('fetches when there is no official rate at all', async () => {
    const { service, nbu } = setup({
      official: null,
      settings: settingsRow({ lastNbuAttemptAt: null }),
    });

    service.requestRefreshIfStale();
    await flush();

    expect(nbu.fetchUsdRate).toHaveBeenCalledTimes(1);
  });

  it('does not retry within an hour of the last attempt', async () => {
    const { service, nbu } = setup({
      official: rateRow({ fetchedAt: new Date(NOW.getTime() - 40 * HOUR_MS) }),
      settings: settingsRow({
        lastNbuAttemptAt: new Date(NOW.getTime() - HOUR_MS / 2),
      }),
    });

    service.requestRefreshIfStale();
    await flush();

    expect(nbu.fetchUsdRate).not.toHaveBeenCalled();
  });

  it('starts one fetch for many concurrent requests', async () => {
    const { service, nbu } = setup({
      official: rateRow({ fetchedAt: new Date(NOW.getTime() - 40 * HOUR_MS) }),
      settings: settingsRow({ lastNbuAttemptAt: null }),
    });

    service.requestRefreshIfStale();
    service.requestRefreshIfStale();
    service.requestRefreshIfStale();
    await flush();
    service.requestRefreshIfStale();
    await flush();

    expect(nbu.fetchUsdRate).toHaveBeenCalledTimes(1);
  });

  it('logs a failed background refresh instead of throwing', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const { service, nbu } = setup({
      official: null,
      settings: settingsRow({ lastNbuAttemptAt: null }),
    });
    nbu.fetchUsdRate.mockRejectedValue(new Error('NBU down'));

    expect(() => service.requestRefreshIfStale()).not.toThrow();
    await flush();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NBU down'));
  });
});

describe('ExchangeRateService manual rate', () => {
  it('creates a MANUAL row, points settings at it and notifies', async () => {
    const { service, prisma, changes } = setup();

    await service.setManual('45.1000', 'admin-1');

    expect(prisma.exchangeRate.create).toHaveBeenCalledWith({
      data: {
        source: RateSource.MANUAL,
        rate: '45.1000',
        effectiveDate: new Date('2026-09-14T00:00:00.000Z'),
        fetchedAt: NOW,
        createdById: 'admin-1',
      },
    });
    expect(prisma.pricingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { manualRateId: 'created' },
    });
    expect(prisma.exchangeRate.delete).not.toHaveBeenCalled();
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous manual row', async () => {
    const { service, prisma } = setup({
      settings: settingsRow({ manualRateId: 'old-manual' }),
    });

    await service.setManual('45.1000', 'admin-1');

    expect(prisma.exchangeRate.delete).toHaveBeenCalledWith({
      where: { id: 'old-manual' },
    });
  });

  it('clears the pointer, drops the row and notifies', async () => {
    const { service, prisma, changes } = setup({
      settings: settingsRow({ manualRateId: 'manual' }),
    });

    await service.clearManual();

    expect(prisma.pricingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { manualRateId: null },
    });
    expect(prisma.exchangeRate.delete).toHaveBeenCalledWith({
      where: { id: 'manual' },
    });
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('is a no-op to clear when there is no manual rate', async () => {
    const { service, prisma } = setup();

    await service.clearManual();

    expect(prisma.pricingSettings.update).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.delete).not.toHaveBeenCalled();
  });
});
