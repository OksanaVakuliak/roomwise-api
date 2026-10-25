import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { Prisma } from '../../../generated/prisma/client';
import {
  IdempotencyScope,
  LeadStatus,
  Locale,
} from '../../../generated/prisma/enums';
import { AdminLeadsService } from './admin-leads.service';

const LEAD_ID = 'lead-1';
const REVISION = 'revision-1';
const CREATED_AT = new Date('2026-10-22T12:00:00.000Z');
const ADMIN = { id: 'admin-1', login: 'admin', isDemo: false, sessionId: 's' };
const DEMO = { ...ADMIN, id: 'demo-1', login: 'demo', isDemo: true };

const listRow = {
  id: LEAD_ID,
  number: 7,
  createdAt: CREATED_AT,
  status: LeadStatus.NEW,
  name: 'Олена',
  phone: '+380671234567',
  email: 'olena@mail.com',
  expiredAtSubmission: false,
  calculationVersion: { totalUsdCents: 12_300 },
};

const detailRow = {
  ...listRow,
  comment: 'call me',
  consentText: 'consent',
  consentAt: CREATED_AT,
  locale: Locale.UK,
  revision: REVISION,
  calculationVersion: {
    totalUsdCents: 12_300,
    number: 2,
    calculation: { publicId: 'public' },
  },
  statusChanges: [
    {
      fromStatus: null,
      toStatus: LeadStatus.NEW,
      changedAt: CREATED_AT,
      changedBy: null,
    },
  ],
  notes: [
    {
      id: 'note-1',
      text: 'secret',
      createdAt: CREATED_AT,
      author: { id: 'admin-1', login: 'admin' },
    },
  ],
};

function createService() {
  const tx = {
    lead: { findUnique: vi.fn(), updateMany: vi.fn() },
    leadStatusChange: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((arg: ((client: typeof tx) => unknown) | unknown[]) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg),
    ),
    idempotencyKey: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    lead: {
      findMany: vi.fn().mockResolvedValue([listRow]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(detailRow),
      deleteMany: vi.fn(),
    },
    leadNote: { create: vi.fn() },
  };
  const calculations = {
    findVersion: vi.fn().mockResolvedValue({
      publicId: 'public',
      configuration: { rooms: [] },
      rooms: [],
      lines: [],
    }),
  };
  const service = new AdminLeadsService(prisma as never, calculations as never);

  return { service, tx, prisma, calculations };
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : error;
  }
  return null;
}

describe('AdminLeadsService.list', () => {
  it('hides spam by default and orders newest first', async () => {
    const { service, prisma } = createService();

    const result = await service.list({ page: 2, pageSize: 10 }, ADMIN);

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { not: LeadStatus.SPAM } },
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: LEAD_ID,
          number: 7,
          createdAt: CREATED_AT.toISOString(),
          status: LeadStatus.NEW,
          name: 'Олена',
          phone: '+380671234567',
          email: 'olena@mail.com',
          expiredAtSubmission: false,
          totalUsdCents: 12_300,
          masked: false,
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
    });
  });

  it('filters by an explicit status, including spam', async () => {
    const { service, prisma } = createService();

    await service.list(
      { status: LeadStatus.SPAM, page: 1, pageSize: 50 },
      ADMIN,
    );

    expect(prisma.lead.count).toHaveBeenCalledWith({
      where: { status: LeadStatus.SPAM },
    });
  });

  it('masks contact data for the demo admin', async () => {
    const { service } = createService();

    const { items } = await service.list({ page: 1, pageSize: 50 }, DEMO);

    expect(items[0]).toMatchObject({
      name: 'О•••',
      phone: '+380•••67',
      email: 'o•••@•••.com',
      masked: true,
    });
  });
});

describe('AdminLeadsService.get', () => {
  it('returns the full lead with the calculation snapshot', async () => {
    const { service, calculations } = createService();

    const result = await service.get(LEAD_ID, 'uk', ADMIN);

    expect(calculations.findVersion).toHaveBeenCalledWith('public', 2, 'uk');
    expect(result).toMatchObject({
      comment: 'call me',
      consentText: 'consent',
      locale: 'uk',
      revision: REVISION,
      masked: false,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: LeadStatus.NEW,
          changedAt: CREATED_AT.toISOString(),
          changedBy: null,
        },
      ],
      notes: [{ id: 'note-1', text: 'secret' }],
      calculation: { publicId: 'public' },
    });
  });

  it('masks personal data and drops free text for the demo admin', async () => {
    const { service } = createService();

    const result = await service.get(LEAD_ID, 'en', DEMO);

    expect(result).toMatchObject({
      name: 'О•••',
      comment: null,
      consentText: null,
      masked: true,
      notes: [{ id: 'note-1', text: null }],
      calculation: { publicId: '•••' },
    });
  });

  describe('room names', () => {
    const named = {
      configuration: { rooms: [{ clientId: 'a', name: 'Master bedroom' }] },
      rooms: [
        { clientId: 'a', name: 'Master bedroom', roomTypeName: 'Bedroom' },
      ],
      lines: [{ roomClientId: 'a', roomName: 'Master bedroom' }],
    };

    it('replaces custom room names for the demo admin', async () => {
      const { service, calculations } = createService();
      calculations.findVersion.mockResolvedValue(named);

      const result = await service.get(LEAD_ID, 'en', DEMO);

      expect(JSON.stringify(result.calculation)).not.toContain(
        'Master bedroom',
      );
      expect(result.calculation.rooms[0]?.name).toBe('Bedroom');
      expect(result.calculation.lines[0]?.roomName).toBe('Bedroom');
    });

    it('keeps custom room names for a regular admin', async () => {
      const { service, calculations } = createService();
      calculations.findVersion.mockResolvedValue(named);

      const result = await service.get(LEAD_ID, 'en', ADMIN);

      expect(result.calculation).toEqual(named);
    });
  });

  it('throws NOT_FOUND for a missing lead', async () => {
    const { service, prisma } = createService();
    prisma.lead.findUnique.mockResolvedValue(null);

    expect(await codeOf(service.get(LEAD_ID, 'en', ADMIN))).toBe(
      ERROR_CODES.NOT_FOUND,
    );
  });
});

describe('AdminLeadsService.changeStatus', () => {
  const input = { status: LeadStatus.DONE, revision: REVISION };

  it('updates by revision and records the status change', async () => {
    const { service, tx } = createService();
    tx.lead.findUnique.mockResolvedValue({
      status: LeadStatus.NEW,
      revision: REVISION,
    });
    tx.lead.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.changeStatus(LEAD_ID, input, ADMIN);

    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: LEAD_ID, revision: REVISION },
      data: { status: LeadStatus.DONE, revision: expect.any(String) },
    });
    expect(tx.leadStatusChange.create).toHaveBeenCalledWith({
      data: {
        leadId: LEAD_ID,
        fromStatus: LeadStatus.NEW,
        toStatus: LeadStatus.DONE,
        changedById: ADMIN.id,
      },
    });
    expect(result.id).toBe(LEAD_ID);
  });

  it('throws NOT_FOUND for a missing lead', async () => {
    const { service, tx } = createService();
    tx.lead.findUnique.mockResolvedValue(null);

    expect(await codeOf(service.changeStatus(LEAD_ID, input, ADMIN))).toBe(
      ERROR_CODES.NOT_FOUND,
    );
  });

  it('throws STALE_REVISION before comparing statuses', async () => {
    const { service, tx } = createService();
    tx.lead.findUnique.mockResolvedValue({
      status: LeadStatus.DONE,
      revision: 'newer',
    });

    expect(await codeOf(service.changeStatus(LEAD_ID, input, ADMIN))).toBe(
      ERROR_CODES.STALE_REVISION,
    );
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it('throws SAME_STATUS when the status is unchanged', async () => {
    const { service, tx } = createService();
    tx.lead.findUnique.mockResolvedValue({
      status: LeadStatus.DONE,
      revision: REVISION,
    });

    expect(await codeOf(service.changeStatus(LEAD_ID, input, ADMIN))).toBe(
      ERROR_CODES.SAME_STATUS,
    );
    expect(tx.leadStatusChange.create).not.toHaveBeenCalled();
  });

  it('throws STALE_REVISION when a concurrent update wins the race', async () => {
    const { service, tx } = createService();
    tx.lead.findUnique
      .mockResolvedValueOnce({ status: LeadStatus.NEW, revision: REVISION })
      .mockResolvedValueOnce({ revision: 'newer' });
    tx.lead.updateMany.mockResolvedValue({ count: 0 });

    expect(await codeOf(service.changeStatus(LEAD_ID, input, ADMIN))).toBe(
      ERROR_CODES.STALE_REVISION,
    );
    expect(tx.leadStatusChange.create).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the lead is deleted during the race', async () => {
    const { service, tx } = createService();
    tx.lead.findUnique
      .mockResolvedValueOnce({ status: LeadStatus.NEW, revision: REVISION })
      .mockResolvedValueOnce(null);
    tx.lead.updateMany.mockResolvedValue({ count: 0 });

    expect(await codeOf(service.changeStatus(LEAD_ID, input, ADMIN))).toBe(
      ERROR_CODES.NOT_FOUND,
    );
  });
});

describe('AdminLeadsService.addNote', () => {
  it('stores the note with the author', async () => {
    const { service, prisma } = createService();
    prisma.leadNote.create.mockResolvedValue({
      id: 'note-2',
      text: 'called',
      createdAt: CREATED_AT,
    });

    const result = await service.addNote(LEAD_ID, { text: 'called' }, ADMIN);

    expect(prisma.leadNote.create).toHaveBeenCalledWith({
      data: { leadId: LEAD_ID, text: 'called', authorId: ADMIN.id },
      select: { id: true, text: true, createdAt: true },
    });
    expect(result).toEqual({
      id: 'note-2',
      text: 'called',
      createdAt: CREATED_AT.toISOString(),
      author: { id: ADMIN.id, login: ADMIN.login },
    });
  });

  it('throws NOT_FOUND for a missing lead', async () => {
    const { service, prisma } = createService();
    prisma.leadNote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key violation', {
        code: 'P2003',
        clientVersion: '7.10.0',
      }),
    );

    expect(await codeOf(service.addNote(LEAD_ID, { text: 'x' }, ADMIN))).toBe(
      ERROR_CODES.NOT_FOUND,
    );
  });

  it('rethrows other database errors', async () => {
    const { service, prisma } = createService();
    const failure = new Error('db down');
    prisma.leadNote.create.mockRejectedValue(failure);

    expect(await codeOf(service.addNote(LEAD_ID, { text: 'x' }, ADMIN))).toBe(
      failure,
    );
  });
});

describe('AdminLeadsService.delete', () => {
  it('deletes the lead together with its idempotency keys', async () => {
    const { service, prisma } = createService();
    prisma.lead.deleteMany.mockResolvedValue({ count: 1 });

    await service.delete(LEAD_ID);

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { scope: IdempotencyScope.LEAD, resultId: LEAD_ID },
    });
    expect(prisma.lead.deleteMany).toHaveBeenCalledWith({
      where: { id: LEAD_ID },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('throws NOT_FOUND when nothing was deleted', async () => {
    const { service, prisma } = createService();
    prisma.lead.deleteMany.mockResolvedValue({ count: 0 });

    expect(await codeOf(service.delete(LEAD_ID))).toBe(ERROR_CODES.NOT_FOUND);
  });
});
