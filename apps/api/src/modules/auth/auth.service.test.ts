import * as bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../common/http/error-codes';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Admin } from '../../generated/prisma/client';
import { AuthService } from './auth.service';
import { Clock } from './clock';
import type { SessionService } from './session.service';

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
  compare: vi.fn(),
}));

const hashMock = bcrypt.hash as unknown as ReturnType<typeof vi.fn>;
const compareMock = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

const ADMIN_ID = 'admin-1';
const SESSION_ID = 'session-1';
const NOW = new Date('2026-09-23T12:00:00.000Z');

function createAdmin(overrides: Partial<Admin> = {}): Admin {
  return {
    id: ADMIN_ID,
    login: 'admin',
    passwordHash: 'stored-hash',
    isDemo: false,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrisma(admin: Admin | null) {
  return {
    admin: {
      findUnique: vi.fn().mockResolvedValue(admin),
      update: vi.fn().mockResolvedValue({ failedLoginCount: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
}

function createSessionService(): SessionService {
  return {
    create: vi.fn().mockResolvedValue({ id: SESSION_ID }),
    deleteAllForAdmin: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionService;
}

function createClock(): Clock {
  return { now: () => NOW } as Clock;
}

async function createService(admin: Admin | null) {
  const prisma = createPrisma(admin);
  const sessionService = createSessionService();
  const service = new AuthService(prisma, sessionService, createClock());
  await service.onModuleInit();

  return { service, prisma, sessionService };
}

describe('AuthService.login', () => {
  beforeEach(() => {
    compareMock.mockReset();
    hashMock.mockClear();
  });

  it('throws INVALID_CREDENTIALS for an unknown login but still runs bcrypt.compare', async () => {
    compareMock.mockResolvedValue(false);
    const { service } = await createService(null);

    await expect(service.login('ghost', 'password')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
    });
    expect(compareMock).toHaveBeenCalledTimes(1);
  });

  it('throws ACCOUNT_LOCKED with retryAfterSeconds and never checks the password', async () => {
    const lockedUntil = new Date(NOW.getTime() + 90 * 1000);
    const admin = createAdmin({ lockedUntil });
    const { service } = await createService(admin);

    await expect(service.login('admin', 'password')).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      params: { retryAfterSeconds: 90 },
    });
    expect(compareMock).not.toHaveBeenCalled();
  });

  it('sets lockedUntil and resets the counter on the 5th failed attempt', async () => {
    compareMock.mockResolvedValue(false);
    const admin = createAdmin({ failedLoginCount: 4 });
    const { service, prisma } = await createService(admin);
    vi.mocked(prisma.admin.update).mockResolvedValue({
      failedLoginCount: 5,
    } as never);

    await expect(
      service.login('admin', 'wrong-password'),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CREDENTIALS });

    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: ADMIN_ID },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    expect(prisma.admin.updateMany).toHaveBeenCalledWith({
      where: { id: ADMIN_ID, failedLoginCount: { gte: 5 } },
      data: {
        lockedUntil: new Date(NOW.getTime() + 15 * 60 * 1000),
        failedLoginCount: 0,
      },
    });
  });

  it('does not lock the account before the 5th failure', async () => {
    compareMock.mockResolvedValue(false);
    const admin = createAdmin({ failedLoginCount: 1 });
    const { service, prisma } = await createService(admin);
    vi.mocked(prisma.admin.update).mockResolvedValue({
      failedLoginCount: 2,
    } as never);

    await expect(service.login('admin', 'wrong')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
    });
    expect(prisma.admin.updateMany).not.toHaveBeenCalled();
  });

  it('resets failedLoginCount and lockedUntil on success and creates a session', async () => {
    compareMock.mockResolvedValue(true);
    const admin = createAdmin({ failedLoginCount: 3 });
    const { service, prisma, sessionService } = await createService(admin);

    const result = await service.login('admin', 'correct-password');

    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: ADMIN_ID },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    expect(sessionService.create).toHaveBeenCalledWith(ADMIN_ID);
    expect(result).toEqual({
      admin: {
        id: ADMIN_ID,
        login: 'admin',
        isDemo: false,
        sandbox: null,
        demoLimits: null,
      },
      sessionId: SESSION_ID,
    });
  });
});

describe('AuthService.changePassword', () => {
  beforeEach(() => {
    compareMock.mockReset();
    hashMock.mockClear();
  });

  it('throws INVALID_CREDENTIALS when the current password is wrong', async () => {
    compareMock.mockResolvedValue(false);
    const admin = createAdmin();
    const { service } = await createService(admin);

    await expect(
      service.changePassword(ADMIN_ID, SESSION_ID, 'wrong', 'new-password-1'),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CREDENTIALS });
  });

  it('stores the new hash and deletes the other sessions on success', async () => {
    compareMock.mockResolvedValue(true);
    const admin = createAdmin();
    const { service, prisma, sessionService } = await createService(admin);

    await service.changePassword(
      ADMIN_ID,
      SESSION_ID,
      'current-password',
      'new-password-1',
    );

    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: ADMIN_ID },
      data: { passwordHash: 'hashed-password' },
    });
    expect(sessionService.deleteAllForAdmin).toHaveBeenCalledWith(
      ADMIN_ID,
      SESSION_ID,
    );
  });
});
