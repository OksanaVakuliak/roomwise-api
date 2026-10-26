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

const CURRENT_STATUS = { changed: true, marker: 'current' };
const FRESH_STATUS = { changed: false, marker: 'fresh' };

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
      update: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ latest_version_number: 2 }]),
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
  const priceStatus = {
    current: vi.fn().mockResolvedValue(CURRENT_STATUS),
    fresh: vi.fn().mockReturnValue(FRESH_STATUS),
  };
  const service = new CalculationsService(
    prisma as never,
    { now: () => NOW } as never,
    builder as never,
    settings as never,
    idempotency as never,
    presenter as never,
    priceStatus as never,
  );

  return { service, tx, prisma, builder, idempotency, presenter, priceStatus };
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

  it('presents a fresh price status for the created version', async () => {
    const { service, presenter, priceStatus } = createService();

    await service.create(input, CONTEXT, 'uk');

    expect(priceStatus.fresh).toHaveBeenCalledWith(
      expect.objectContaining({
        totalUsdCents: SAVED_TOTAL,
        pricingVersion: PRICING_VERSION,
      }),
    );
    expect(priceStatus.current).not.toHaveBeenCalled();
    expect(presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({ priceStatus: FRESH_STATUS }),
    );
  });
});

describe('CalculationsService.recalculate', () => {
  const CONFIGURATION = { rooms: [{ id: 'room' }] };
  const RECALCULATE_CONTEXT = {
    ...CONTEXT,
    scope: IdempotencyScope.RECALCULATE,
  };
  const base = {
    ...storedVersion(1),
    snapshot: {
      ...snapshot,
      configuration: CONFIGURATION,
      lines: [],
      style: { id: STYLE_ID, name: { en: 'Style', uk: 'Style' } },
    },
  };

  function setup(overrides: { style?: null; version?: null } = {}) {
    const ctx = createService();
    ctx.prisma.calculation.findUnique.mockResolvedValue({
      id: 'calc-1',
      publicId: 'public',
    });
    ctx.prisma.calculationVersion.findUnique.mockResolvedValue(
      overrides.version === null
        ? null
        : { ...base, snapshot: { ...base.snapshot, ...overrides } },
    );
    ctx.prisma.calculationVersion.findMany.mockResolvedValue([
      summaryOf(storedVersion(1)),
      summaryOf(storedVersion(3)),
    ]);

    return ctx;
  }

  async function failureOf(promise: Promise<unknown>) {
    const error = await promise.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);

    return (error as AppError).code;
  }

  it('answers CALCULATION_NOT_FOUND for an unknown public id', async () => {
    const ctx = setup();
    ctx.prisma.calculation.findUnique.mockResolvedValue(null);

    const code = await failureOf(
      ctx.service.recalculate('missing', 1, RECALCULATE_CONTEXT, 'uk'),
    );

    expect(code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    expect(ctx.prisma.calculationVersion.findUnique).not.toHaveBeenCalled();
  });

  it('answers CALCULATION_NOT_FOUND for an unknown base version', async () => {
    const ctx = setup({ version: null });

    const code = await failureOf(
      ctx.service.recalculate('public', 9, RECALCULATE_CONTEXT, 'uk'),
    );

    expect(code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    expect(ctx.prisma.calculationVersion.findUnique).toHaveBeenCalledWith({
      where: { calculationId_number: { calculationId: 'calc-1', number: 9 } },
    });
  });

  it('answers STYLE_NOT_FOUND when the stored snapshot has no style', async () => {
    const ctx = setup({ style: null });

    const code = await failureOf(
      ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'uk'),
    );

    expect(code).toBe(ERROR_CODES.STYLE_NOT_FOUND);
    expect(ctx.builder.build).not.toHaveBeenCalled();
  });

  it('rebuilds the snapshot from the stored configuration and style', async () => {
    const ctx = setup();

    await ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'uk');

    expect(ctx.builder.build).toHaveBeenCalledWith({
      configuration: CONFIGURATION,
      styleId: STYLE_ID,
      createdAt: NOW,
      missingReferences: 'unavailable',
      previous: base.snapshot,
    });
  });

  it('answers CALCULATION_NOT_FOUND when the locked row has vanished', async () => {
    const ctx = setup();
    ctx.tx.$queryRaw.mockResolvedValue([]);

    const code = await failureOf(
      ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'uk'),
    );

    expect(code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    expect(ctx.tx.calculationVersion.create).not.toHaveBeenCalled();
  });

  it('stores the number after the latest one read under the row lock', async () => {
    const ctx = setup();
    ctx.tx.$queryRaw.mockResolvedValue([{ latest_version_number: 5 }]);

    await ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'uk');

    expect(ctx.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(ctx.tx.calculationVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        calculationId: 'calc-1',
        number: 6,
        expiresAt: new Date(NOW.getTime() + VALIDITY_DAYS * DAY_MS),
        createdAt: NOW,
      }),
    });
    expect(ctx.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.tx.calculationVersion.create.mock.invocationCallOrder[0],
    );
  });

  it('moves latestVersionNumber to the new number', async () => {
    const ctx = setup();

    await ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'uk');

    expect(ctx.tx.calculation.update).toHaveBeenCalledWith({
      where: { id: 'calc-1' },
      data: { latestVersionNumber: 3 },
    });
  });

  it('records the idempotency key inside the transaction with the version id', async () => {
    const ctx = setup();

    await ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'uk');

    expect(ctx.idempotency.record).toHaveBeenCalledWith(ctx.tx, {
      ...RECALCULATE_CONTEXT,
      resultId: VERSION_ID,
    });
  });

  it('presents the new version with the sibling versions up to it', async () => {
    const ctx = setup();

    await ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'en');

    expect(ctx.prisma.calculationVersion.findMany).toHaveBeenCalledWith({
      where: { calculationId: 'calc-1', number: { lte: 3 } },
      select: {
        number: true,
        createdAt: true,
        totalUsdCents: true,
        expiresAt: true,
      },
    });
    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: 'en',
        publicId: 'public',
        now: NOW,
        version: expect.objectContaining({ number: 3 }),
      }),
    );
  });

  it('presents a fresh price status for the new version', async () => {
    const ctx = setup();

    await ctx.service.recalculate('public', 1, RECALCULATE_CONTEXT, 'en');

    expect(ctx.priceStatus.fresh).toHaveBeenCalledWith(
      expect.objectContaining({
        totalUsdCents: SAVED_TOTAL,
        pricingVersion: PRICING_VERSION,
      }),
    );
    expect(ctx.priceStatus.current).not.toHaveBeenCalled();
    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({ priceStatus: FRESH_STATUS }),
    );
  });
});

describe('CalculationsService recalculation replay', () => {
  function setup() {
    const ctx = createService();
    ctx.service.onModuleInit();
    const [scope, loader] = ctx.idempotency.registerLoader.mock.calls[1];

    expect(scope).toBe(IdempotencyScope.RECALCULATE);

    return { ...ctx, loader };
  }

  it('replays the stored version as a version view', async () => {
    const ctx = setup();
    ctx.prisma.calculationVersion.findUnique.mockResolvedValue({
      ...storedVersion(3),
      calculation: { id: 'calc-1', publicId: 'public' },
    });
    ctx.prisma.calculationVersion.findMany.mockResolvedValue([
      summaryOf(storedVersion(3)),
    ]);

    const result = await ctx.loader(
      { resultId: VERSION_ID },
      { query: { lang: 'en' }, body: { basedOnVersion: 1 } },
    );

    expect(ctx.prisma.calculationVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: VERSION_ID } }),
    );
    expect(ctx.prisma.calculationVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { calculationId: 'calc-1', number: { lte: 3 } },
      }),
    );
    expect(result).toEqual({
      presented: expect.objectContaining({
        lang: 'en',
        publicId: 'public',
        now: NOW,
        version: expect.objectContaining({ number: 3 }),
      }),
    });
  });

  it('replays a fresh price status without re-estimating', async () => {
    const ctx = setup();
    ctx.prisma.calculationVersion.findUnique.mockResolvedValue({
      ...storedVersion(3),
      calculation: { id: 'calc-1', publicId: 'public' },
    });
    ctx.prisma.calculationVersion.findMany.mockResolvedValue([
      summaryOf(storedVersion(3)),
    ]);

    await ctx.loader(
      { resultId: VERSION_ID },
      { query: { lang: 'en' }, body: { basedOnVersion: 1 } },
    );

    expect(ctx.priceStatus.fresh).toHaveBeenCalledWith(
      expect.objectContaining({ totalUsdCents: SAVED_TOTAL }),
    );
    expect(ctx.priceStatus.current).not.toHaveBeenCalled();
  });

  it('answers CALCULATION_NOT_FOUND when the version no longer exists', async () => {
    const ctx = setup();
    ctx.prisma.calculationVersion.findUnique.mockResolvedValue(null);

    const error = await ctx
      .loader({ resultId: VERSION_ID }, { query: { lang: 'en' }, body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
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

  it('presents the current price status of the stored version', async () => {
    const ctx = setup();

    await ctx.service.findVersion('public', 1, 'uk');

    expect(ctx.priceStatus.current).toHaveBeenCalledWith({
      id: VERSION_ID,
      snapshot,
      totalUsdCents: SAVED_TOTAL,
      pricingVersion: PRICING_VERSION,
    });
    expect(ctx.priceStatus.fresh).not.toHaveBeenCalled();
    expect(ctx.presenter.present).toHaveBeenCalledWith(
      expect.objectContaining({ priceStatus: CURRENT_STATUS }),
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

  it('replays a fresh price status without re-estimating', async () => {
    const ctx = setup();

    await ctx.loader(ROW, { query: { lang: 'en' }, body });

    expect(ctx.priceStatus.fresh).toHaveBeenCalledWith(
      expect.objectContaining({ totalUsdCents: SAVED_TOTAL }),
    );
    expect(ctx.priceStatus.current).not.toHaveBeenCalled();
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

describe('CalculationsService.findStoredVersion', () => {
  it('returns the version reference with the public id', async () => {
    const ctx = createService();
    const expiresAt = new Date(NOW.getTime() + DAY_MS);
    (ctx.prisma.calculationVersion as { findFirst?: unknown }).findFirst = vi
      .fn()
      .mockResolvedValue({ id: VERSION_ID, number: 2, expiresAt });

    await expect(ctx.service.findStoredVersion('public', 2)).resolves.toEqual({
      id: VERSION_ID,
      number: 2,
      expiresAt,
      publicId: 'public',
    });
  });

  it('answers CALCULATION_NOT_FOUND for a missing or non-positive version', async () => {
    const ctx = createService();
    (ctx.prisma.calculationVersion as { findFirst?: unknown }).findFirst = vi
      .fn()
      .mockResolvedValue(null);

    for (const number of [1, 0]) {
      await expect(
        ctx.service.findStoredVersion('public', number),
      ).rejects.toMatchObject({ code: ERROR_CODES.CALCULATION_NOT_FOUND });
    }
  });
});
