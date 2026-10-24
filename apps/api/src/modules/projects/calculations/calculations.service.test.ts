import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { CalculationsService } from './calculations.service';

vi.mock('../presenters/version-view.presenter', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  parseStoredSnapshot: (value: unknown) => value,
}));

const NOW = new Date('2026-10-22T12:00:00.000Z');
const DAY_MS = 86_400_000;
const VALIDITY_DAYS = 14;
const PRICING_VERSION = 'aaaaaaaaaaaaaaaa';
const STALE_VERSION = 'bbbbbbbbbbbbbbbb';
const SAVED_TOTAL = 10_000;
const CLIENT_TOTAL = 10_500;
const VERSION_ID = 'version-1';
const STYLE_ID = '0b7c4a52-1c1f-4c0e-9d52-6e1d3f6f6a01';
const CONTEXT = {
  scope: IdempotencyScope.SAVE,
  key: 'key',
  requestHash: 'hash',
};

const snapshot = {
  schemaVersion: 1,
  pricingVersion: PRICING_VERSION,
  createdAt: NOW.toISOString(),
  estimate: {
    totals: { usdCents: SAVED_TOTAL, uahKopecks: 41_000 },
    incomplete: false,
  },
};

function storedVersion(number = 1) {
  return {
    id: VERSION_ID,
    calculationId: 'calc-1',
    number,
    snapshot,
    pricingVersion: PRICING_VERSION,
    totalUsdCents: SAVED_TOTAL,
    incomplete: false,
    expiresAt: new Date(NOW.getTime() + VALIDITY_DAYS * DAY_MS),
    createdAt: NOW,
  };
}

function storedCalculation(versions = [storedVersion(1), storedVersion(2)]) {
  return {
    id: 'calc-1',
    publicId: 'public',
    latestVersionNumber: versions.length,
    versions,
  };
}

function summaryOf(version: ReturnType<typeof storedVersion>) {
  return {
    number: version.number,
    createdAt: version.createdAt,
    totalUsdCents: version.totalUsdCents,
    expiresAt: version.expiresAt,
  };
}

function createService() {
  const tx = {
    calculation: {
      create: vi.fn().mockResolvedValue(storedCalculation([])),
    },
    calculationVersion: {
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...storedVersion(), ...data, id: VERSION_ID }),
        ),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    calculation: { findUnique: vi.fn() },
    calculationVersion: { findUnique: vi.fn(), findMany: vi.fn() },
  };
  const builder = { build: vi.fn().mockResolvedValue(snapshot) };
  const settings = {
    get: vi.fn().mockResolvedValue({ calculationValidityDays: VALIDITY_DAYS }),
  };
  const idempotency = { record: vi.fn(), registerLoader: vi.fn() };
  const presenter = { present: vi.fn((input) => ({ presented: input })) };
  const service = new CalculationsService(
    prisma as never,
    { now: () => NOW } as never,
    builder as never,
    settings as never,
    idempotency as never,
    presenter as never,
  );

  return { service, tx, prisma, builder, idempotency, presenter };
}

const input = {
  configuration: { rooms: [] },
  styleId: STYLE_ID,
  clientPricingVersion: PRICING_VERSION,
  clientTotalUsdCents: SAVED_TOTAL,
} as never;

describe('CalculationsService.create', () => {
  it('builds the snapshot before the transaction with the current instant', async () => {
    const { service, builder, prisma } = createService();

    await service.create(input, CONTEXT, 'uk');

    expect(builder.build).toHaveBeenCalledWith({
      configuration: { rooms: [] },
      styleId: STYLE_ID,
      createdAt: NOW,
    });
    expect(builder.build.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it('stores version 1 with totals, expiry and the shared instant', async () => {
    const { service, tx } = createService();

    await service.create(input, CONTEXT, 'uk');

    expect(tx.calculation.create).toHaveBeenCalledWith({
      data: {
        publicId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
        latestVersionNumber: 1,
      },
    });
    expect(tx.calculationVersion.create).toHaveBeenCalledWith({
      data: {
        calculationId: 'calc-1',
        number: 1,
        snapshot,
        snapshotSchemaVersion: 1,
        pricingVersion: PRICING_VERSION,
        totalUsdCents: SAVED_TOTAL,
        totalUahKopecks: 41_000,
        incomplete: false,
        expiresAt: new Date(NOW.getTime() + VALIDITY_DAYS * DAY_MS),
        createdAt: NOW,
      },
    });
  });

  it('records the idempotency key inside the transaction with the version id', async () => {
    const { service, tx, idempotency } = createService();

    await service.create(input, CONTEXT, 'uk');

    expect(idempotency.record).toHaveBeenCalledWith(tx, {
      ...CONTEXT,
      resultId: VERSION_ID,
    });
  });

  it('returns no price difference for the current pricing version', async () => {
    const { service } = createService();

    const result = await service.create(input, CONTEXT, 'uk');

    expect(result.priceDifference).toBeNull();
  });

  it('returns the difference for a stale pricing version', async () => {
    const { service } = createService();

    const result = await service.create(
      {
        ...(input as object),
        clientPricingVersion: STALE_VERSION,
        clientTotalUsdCents: CLIENT_TOTAL,
      } as never,
      CONTEXT,
      'uk',
    );

    expect(result.priceDifference).toEqual({
      clientTotalUsdCents: CLIENT_TOTAL,
      savedTotalUsdCents: SAVED_TOTAL,
      diffCents: SAVED_TOTAL - CLIENT_TOTAL,
    });
  });

  it('presents the version in the requested language', async () => {
    const { service, presenter } = createService();

    await service.create(input, CONTEXT, 'en');

    expect(presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en', publicId: 'public', now: NOW }),
    );
  });
});

describe('CalculationsService.findVersion', () => {
  function setup(numbers = [1, 2]) {
    const ctx = createService();
    const versions = numbers.map(storedVersion);
    ctx.prisma.calculation.findUnique.mockImplementation(
      ({ where }: { where: { publicId: string } }) =>
        Promise.resolve(
          where.publicId === 'public'
            ? {
                ...storedCalculation([]),
                latestVersionNumber: Math.max(...numbers),
                versions: versions.map(summaryOf),
              }
            : null,
        ),
    );
    ctx.prisma.calculationVersion.findUnique.mockImplementation(
      ({ where }: { where: { calculationId_number: { number: number } } }) =>
        Promise.resolve(
          versions.find(
            (item) => item.number === where.calculationId_number.number,
          ) ?? null,
        ),
    );

    return ctx;
  }

  it('returns the latest version when no number is given', async () => {
    const ctx = setup();

    await ctx.service.findVersion('public', null, 'uk');

    expect(ctx.prisma.calculationVersion.findUnique).toHaveBeenCalledWith({
      where: { calculationId_number: { calculationId: 'calc-1', number: 2 } },
    });
    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({
        version: expect.objectContaining({ number: 2 }),
        versions: [
          expect.objectContaining({ number: 1 }),
          expect.objectContaining({ number: 2 }),
        ],
      }),
    );
  });

  it('returns the requested version', async () => {
    const ctx = setup();

    await ctx.service.findVersion('public', 1, 'uk');

    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({
        version: expect.objectContaining({ number: 1 }),
      }),
    );
  });

  it('loads only the summaries of the sibling versions', async () => {
    const ctx = setup();

    await ctx.service.findVersion('public', null, 'uk');

    expect(ctx.prisma.calculation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          versions: {
            select: {
              number: true,
              createdAt: true,
              totalUsdCents: true,
              expiresAt: true,
            },
          },
        }),
      }),
    );
  });

  it('answers CALCULATION_NOT_FOUND for a non-positive number without reading the database', async () => {
    const ctx = setup();

    const error = await ctx.service
      .findVersion('public', 0, 'uk')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    expect(ctx.prisma.calculation.findUnique).not.toHaveBeenCalled();
  });

  it('answers CALCULATION_NOT_FOUND for an unknown id and an unknown number', async () => {
    const ctx = setup();
    const unknownId = await ctx.service
      .findVersion('missing', null, 'uk')
      .catch((error: unknown) => error);
    const unknownNumber = await ctx.service
      .findVersion('public', 9, 'uk')
      .catch((error: unknown) => error);

    for (const error of [unknownId, unknownNumber]) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    }
  });
});

describe('CalculationsService save replay', () => {
  const KEY_CREATED_AT = new Date(NOW.getTime() + DAY_MS);
  const ROW = { resultId: VERSION_ID, createdAt: KEY_CREATED_AT };
  const body = {
    ...(input as object),
    clientPricingVersion: STALE_VERSION,
    clientTotalUsdCents: CLIENT_TOTAL,
  };

  function setup() {
    const ctx = createService();
    ctx.service.onModuleInit();
    const [scope, loader] = ctx.idempotency.registerLoader.mock.calls[0];
    ctx.prisma.calculationVersion.findUnique.mockResolvedValue({
      ...storedVersion(1),
      calculation: { id: 'calc-1', publicId: 'public' },
    });
    ctx.prisma.calculationVersion.findMany.mockResolvedValue([
      summaryOf(storedVersion(1)),
    ]);

    return { ...ctx, scope, loader };
  }

  it('replays the stored version with the request language and body', async () => {
    const ctx = setup();

    const result = await ctx.loader(ROW, { query: { lang: 'en' }, body });

    expect(ctx.scope).toBe(IdempotencyScope.SAVE);
    expect(ctx.prisma.calculationVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: VERSION_ID } }),
    );
    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en', publicId: 'public' }),
    );
    expect(result.priceDifference).toEqual({
      clientTotalUsdCents: CLIENT_TOTAL,
      savedTotalUsdCents: SAVED_TOTAL,
      diffCents: SAVED_TOTAL - CLIENT_TOTAL,
    });
  });

  it('lists only versions up to the saved one', async () => {
    const ctx = setup();

    await ctx.loader(ROW, { query: { lang: 'en' }, body });

    expect(ctx.prisma.calculationVersion.findMany).toHaveBeenCalledWith({
      where: { calculationId: 'calc-1', number: { lte: 1 } },
      select: {
        number: true,
        createdAt: true,
        totalUsdCents: true,
        expiresAt: true,
      },
    });
    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({
        versions: [expect.objectContaining({ number: 1 })],
      }),
    );
  });

  it('evaluates expiry at the creation time of the version, as the first response did', async () => {
    const ctx = setup();

    await ctx.loader(ROW, { query: { lang: 'en' }, body });

    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({ now: NOW }),
    );
  });

  it('answers CALCULATION_NOT_FOUND when the version no longer exists', async () => {
    const ctx = setup();
    ctx.prisma.calculationVersion.findUnique.mockResolvedValue(null);

    const error = await ctx
      .loader(ROW, { query: { lang: 'en' }, body })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
  });
});
