import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { IdempotencyScope, LeadStatus } from '../../../generated/prisma/enums';
import { LeadsService } from './leads.service';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const DAY_MS = 86_400_000;
const VERSION_ID = 'version-1';
const LEAD_ID = 'lead-1';
const LEAD_NUMBER = 7;
const FAKE_NUMBER = 42;
const RETENTION_DAYS = 30;
const CONTEXT = {
  scope: IdempotencyScope.LEAD,
  key: 'key',
  requestHash: 'hash',
};

const stored = {
  id: VERSION_ID,
  number: 3,
  publicId: 'public',
  expiresAt: new Date(NOW.getTime() + DAY_MS),
};

const base = {
  name: '  Oksana  ',
  phone: '+380 67 123 45 67',
  email: 'oksana@example.com',
  comment: 'call me',
  consent: { accepted: true as const, text: 'consent' },
  locale: 'uk' as const,
};

const calculationInput = {
  ...base,
  calculation: { publicId: 'public', versionNumber: 3 },
};

const draftInput = {
  ...base,
  draft: { configuration: { rooms: [] }, styleId: 'style' },
};

function createService(storedVersion = stored) {
  const tx = {
    lead: {
      create: vi.fn().mockResolvedValue({ id: LEAD_ID, number: LEAD_NUMBER }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ number: FAKE_NUMBER }]),
  };
  const prisma = {
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    lead: { findUniqueOrThrow: vi.fn() },
    calculationVersion: { findUniqueOrThrow: vi.fn() },
  };
  const calculations = {
    prepareNew: vi.fn().mockResolvedValue({ prepared: true }),
    persistNew: vi.fn().mockResolvedValue({
      version: {
        id: 'draft-version',
        number: 1,
        expiresAt: new Date(NOW.getTime() + DAY_MS),
      },
      calculation: { publicId: 'draft-public' },
    }),
    findStoredVersion: vi.fn().mockResolvedValue(storedVersion),
  };
  const settings = {
    get: vi.fn().mockResolvedValue({
      leadRetentionDays: RETENTION_DAYS,
      leadFormNotice: {
        en: 'Kept {days} days ({days})',
        uk: 'Зберігаємо {days} днів',
      },
    }),
  };
  const idempotency = { record: vi.fn(), registerLoader: vi.fn() };
  const service = new LeadsService(
    prisma as never,
    { now: () => NOW } as never,
    calculations as never,
    settings as never,
    idempotency as never,
  );

  return { service, tx, prisma, calculations, idempotency };
}

function submit(
  service: LeadsService,
  input: object,
  context: typeof CONTEXT = CONTEXT,
) {
  return service.create(input as never, context);
}

describe('LeadsService.create', () => {
  it('creates a lead with the normalized phone and a first status change', async () => {
    const { service, tx } = createService();

    const result = await submit(service, calculationInput);

    expect(tx.lead.create).toHaveBeenCalledWith({
      data: {
        calculationVersionId: VERSION_ID,
        name: 'Oksana',
        phone: '+380671234567',
        email: 'oksana@example.com',
        comment: 'call me',
        consentText: 'consent',
        consentAt: NOW,
        locale: 'UK',
        expiredAtSubmission: false,
        statusChanges: {
          create: { fromStatus: null, toStatus: LeadStatus.NEW },
        },
      },
    });
    expect(result).toEqual({
      leadNumber: LEAD_NUMBER,
      calculation: { publicId: 'public', versionNumber: 3 },
      expiredAtSubmission: false,
    });
  });

  it('records the idempotency key with the lead id in the transaction', async () => {
    const { service, tx, idempotency } = createService();

    await submit(service, calculationInput);

    expect(idempotency.record).toHaveBeenCalledWith(tx, {
      ...CONTEXT,
      resultId: LEAD_ID,
    });
  });

  it('flags a version that expired at the submission instant', async () => {
    const { service, tx } = createService({ ...stored, expiresAt: NOW });

    const result = await submit(service, calculationInput);

    expect(result.expiredAtSubmission).toBe(true);
    expect(tx.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ expiredAtSubmission: true }),
    });
  });

  it('saves a draft as a new calculation inside the lead transaction', async () => {
    const { service, tx, calculations, prisma } = createService();

    const result = await submit(service, draftInput);

    expect(calculations.findStoredVersion).not.toHaveBeenCalled();
    expect(calculations.persistNew).toHaveBeenCalledWith(tx, {
      prepared: true,
    });
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      calculations.persistNew.mock.invocationCallOrder[0],
    );
    expect(tx.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ calculationVersionId: 'draft-version' }),
    });
    expect(result.calculation).toEqual({
      publicId: 'draft-public',
      versionNumber: 1,
    });
  });

  it('rejects an invalid phone before any database work', async () => {
    const { service, prisma, calculations } = createService();

    await expect(
      submit(service, { ...calculationInput, phone: '+38067' }),
    ).rejects.toBeInstanceOf(AppError);
    expect(calculations.prepareNew).not.toHaveBeenCalled();
    expect(calculations.findStoredVersion).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates a missing calculation without opening a transaction', async () => {
    const { service, prisma, calculations } = createService();
    calculations.findStoredVersion.mockRejectedValue(new Error('not found'));

    await expect(submit(service, calculationInput)).rejects.toThrow(
      'not found',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('honeypot', () => {
    const spam = { ...calculationInput, website: ' http://spam ' };

    it('creates no lead and records a fake lead number', async () => {
      const { service, tx, idempotency } = createService();

      const result = await submit(service, spam);

      expect(tx.lead.create).not.toHaveBeenCalled();
      expect(idempotency.record).toHaveBeenCalledWith(tx, {
        ...CONTEXT,
        resultId: VERSION_ID,
        fakeLeadNumber: FAKE_NUMBER,
      });
      expect(result).toEqual({
        leadNumber: FAKE_NUMBER,
        calculation: { publicId: 'public', versionNumber: 3 },
        expiredAtSubmission: false,
      });
    });

    it('still saves a draft calculation', async () => {
      const { service, calculations } = createService();

      await submit(service, { ...draftInput, website: 'x' });

      expect(calculations.persistNew).toHaveBeenCalled();
    });

    it('treats a blank website as a real lead', async () => {
      const { service, tx } = createService();

      await submit(service, { ...calculationInput, website: '   ' });

      expect(tx.lead.create).toHaveBeenCalled();
    });
  });
});

describe('LeadsService replay', () => {
  function loader(ctx: ReturnType<typeof createService>) {
    ctx.service.onModuleInit();
    const [scope, fn] = ctx.idempotency.registerLoader.mock.calls[0];

    expect(scope).toBe(IdempotencyScope.LEAD);

    return fn as (row: unknown, request: unknown) => Promise<unknown>;
  }

  it('rebuilds the response of a real lead', async () => {
    const ctx = createService();
    ctx.prisma.lead.findUniqueOrThrow.mockResolvedValue({
      number: LEAD_NUMBER,
      expiredAtSubmission: true,
      calculationVersion: { number: 3, calculation: { publicId: 'public' } },
    });

    const result = await loader(ctx)(
      { resultId: LEAD_ID, fakeLeadNumber: null, createdAt: NOW },
      {},
    );

    expect(result).toEqual({
      leadNumber: LEAD_NUMBER,
      calculation: { publicId: 'public', versionNumber: 3 },
      expiredAtSubmission: true,
    });
  });

  it('rebuilds the response of a honeypot from the fake number', async () => {
    const ctx = createService();
    ctx.prisma.calculationVersion.findUniqueOrThrow.mockResolvedValue({
      number: 3,
      expiresAt: new Date(NOW.getTime() + DAY_MS),
      calculation: { publicId: 'public' },
    });

    const result = await loader(ctx)(
      { resultId: VERSION_ID, fakeLeadNumber: FAKE_NUMBER, createdAt: NOW },
      {},
    );

    expect(ctx.prisma.lead.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(result).toEqual({
      leadNumber: FAKE_NUMBER,
      calculation: { publicId: 'public', versionNumber: 3 },
      expiredAtSubmission: false,
    });
  });
});

describe('LeadsService.formSettings', () => {
  it('substitutes every days placeholder in the requested language', async () => {
    const { service } = createService();

    await expect(service.formSettings('en')).resolves.toEqual({
      retentionDays: RETENTION_DAYS,
      notice: 'Kept 30 days (30)',
    });
    await expect(service.formSettings('uk')).resolves.toEqual({
      retentionDays: RETENTION_DAYS,
      notice: 'Зберігаємо 30 днів',
    });
  });
});
