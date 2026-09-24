import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../../common/clock/clock';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Admin, AdminSession } from '../../generated/prisma/client';
import { SessionService } from './session.service';

const ADMIN_ID = 'admin-1';
const SESSION_ID = 'session-1';

function createAdmin(overrides: Partial<Admin> = {}): Admin {
  return {
    id: ADMIN_ID,
    login: 'admin',
    passwordHash: 'hash',
    isDemo: false,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createSession(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    id: SESSION_ID,
    adminId: ADMIN_ID,
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    lastSeenAt: new Date('2026-09-23T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrisma(session: (AdminSession & { admin: Admin }) | null) {
  return {
    adminSession: {
      create: vi.fn().mockResolvedValue(createSession()),
      findUnique: vi.fn().mockResolvedValue(session),
      update: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
}

function createClock(now: Date): Clock {
  return { now: () => now } as Clock;
}

describe('SessionService', () => {
  it('creates a session for an admin', async () => {
    const prisma = createPrisma(null);
    const service = new SessionService(prisma, createClock(new Date()));

    await service.create(ADMIN_ID);

    expect(prisma.adminSession.create).toHaveBeenCalledWith({
      data: { adminId: ADMIN_ID },
    });
  });

  it('validates a fresh session and returns the admin', async () => {
    const admin = createAdmin();
    const session = createSession();
    const now = new Date(session.lastSeenAt.getTime() + 1000);
    const prisma = createPrisma({ ...session, admin });
    const service = new SessionService(prisma, createClock(now));

    const result = await service.validate(SESSION_ID);

    expect(result).toEqual({ session, admin });
    expect(prisma.adminSession.deleteMany).not.toHaveBeenCalled();
  });

  it('returns null and deletes the session when inactive for more than 8 hours', async () => {
    const admin = createAdmin();
    const session = createSession();
    const now = new Date(session.lastSeenAt.getTime() + 8 * 60 * 60 * 1000 + 1);
    const prisma = createPrisma({ ...session, admin });
    const service = new SessionService(prisma, createClock(now));

    const result = await service.validate(SESSION_ID);

    expect(result).toBeNull();
    expect(prisma.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it('returns null and deletes the session when older than 7 days', async () => {
    const admin = createAdmin();
    const session = createSession();
    const now = new Date(
      session.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 + 1,
    );
    const prisma = createPrisma({
      ...session,
      lastSeenAt: now,
      admin,
    });
    const service = new SessionService(prisma, createClock(now));

    const result = await service.validate(SESSION_ID);

    expect(result).toBeNull();
    expect(prisma.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it('returns null when the session does not exist', async () => {
    const prisma = createPrisma(null);
    const service = new SessionService(prisma, createClock(new Date()));

    const result = await service.validate(SESSION_ID);

    expect(result).toBeNull();
  });

  it('does not refresh lastSeenAt within the one-minute throttle window', async () => {
    const admin = createAdmin();
    const session = createSession();
    const now = new Date(session.lastSeenAt.getTime() + 30 * 1000);
    const prisma = createPrisma({ ...session, admin });
    const service = new SessionService(prisma, createClock(now));

    await service.validate(SESSION_ID);

    expect(prisma.adminSession.update).not.toHaveBeenCalled();
  });

  it('refreshes lastSeenAt once it is older than one minute', async () => {
    const admin = createAdmin();
    const session = createSession();
    const now = new Date(session.lastSeenAt.getTime() + 61 * 1000);
    const prisma = createPrisma({ ...session, admin });
    const service = new SessionService(prisma, createClock(now));

    await service.validate(SESSION_ID);

    expect(prisma.adminSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { lastSeenAt: now },
    });
  });

  it('deletes a session by id', async () => {
    const prisma = createPrisma(null);
    const service = new SessionService(prisma, createClock(new Date()));

    await service.delete(SESSION_ID);

    expect(prisma.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it('deletes all sessions for an admin except the given one', async () => {
    const prisma = createPrisma(null);
    const service = new SessionService(prisma, createClock(new Date()));

    await service.deleteAllForAdmin(ADMIN_ID, SESSION_ID);

    expect(prisma.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { adminId: ADMIN_ID, id: { not: SESSION_ID } },
    });
  });

  it('deletes all sessions for an admin through the given transaction client', async () => {
    const prisma = createPrisma(null);
    const tx = createPrisma(null);
    const service = new SessionService(prisma, createClock(new Date()));

    await service.deleteAllForAdmin(ADMIN_ID, SESSION_ID, tx);

    expect(tx.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { adminId: ADMIN_ID, id: { not: SESSION_ID } },
    });
    expect(prisma.adminSession.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes all sessions for an admin when no exception is given', async () => {
    const prisma = createPrisma(null);
    const service = new SessionService(prisma, createClock(new Date()));

    await service.deleteAllForAdmin(ADMIN_ID);

    expect(prisma.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { adminId: ADMIN_ID },
    });
  });
});
