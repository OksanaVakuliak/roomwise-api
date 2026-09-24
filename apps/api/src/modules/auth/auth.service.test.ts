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
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

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
  const tx = {
    admin: { update: vi.fn().mockResolvedValue(undefined) },
  };

  return {
    admin: {
      findUnique: vi.fn().mockResolvedValue(admin),
      update: vi.fn().mockResolvedValue(undefined),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: ADMIN_ID }]),
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<void>) =>
      run(tx),
    ),
    tx,
  } as unknown as PrismaService & { tx: typeof tx };
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
  hashMock.mockClear();

  return { service, prisma, sessionService };
}

function reservationValues(prisma: PrismaService): unknown[] {
  return vi.mocked(prisma.$queryRaw).mock.calls[0].slice(1);
}

describe('AuthService.login', () => {
  beforeEach(() => {
    compareMock.mockReset();
    hashMock.mockClear();
  });

  it('throws INVALID_CREDENTIALS for an unknown login but still runs bcrypt.compare', async () => {
    compareMock.mockResolvedValue(false);
    const { service, prisma } = await createService(null);

    await expect(service.login('ghost', 'password')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
    });
    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reserves an attempt with the clock time before checking the password', async () => {
    compareMock.mockResolvedValue(true);
    const { service, prisma } = await createService(createAdmin());

    await service.login('admin', 'correct-password');

    expect(reservationValues(prisma)).toEqual([
      5,
      new Date(NOW.getTime() + LOCKOUT_DURATION_MS),
      ADMIN_ID,
      NOW,
    ]);
    expect(
      vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0],
    ).toBeLessThan(compareMock.mock.invocationCallOrder[0]);
  });

  it('throws ACCOUNT_LOCKED with retryAfterSeconds and never checks the password when no attempt can be reserved', async () => {
    const lockedUntil = new Date(NOW.getTime() + 90 * 1000);
    const { service, prisma } = await createService(
      createAdmin({ failedLoginCount: 5, lockedUntil }),
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    await expect(service.login('admin', 'password')).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      params: { retryAfterSeconds: 90 },
    });
    expect(compareMock).not.toHaveBeenCalled();
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it('reports the full lockout duration when the lock is not readable', async () => {
    const { service, prisma } = await createService(createAdmin());
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    vi.mocked(prisma.admin.findUnique)
      .mockResolvedValueOnce(createAdmin())
      .mockResolvedValueOnce({ lockedUntil: null } as never);

    await expect(service.login('admin', 'password')).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      params: { retryAfterSeconds: 900 },
    });
    expect(compareMock).not.toHaveBeenCalled();
  });

  it('keeps the reserved attempt counted when the password is wrong', async () => {
    compareMock.mockResolvedValue(false);
    const { service, prisma } = await createService(
      createAdmin({ failedLoginCount: 4 }),
    );

    await expect(
      service.login('admin', 'wrong-password'),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CREDENTIALS });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.admin.update).not.toHaveBeenCalled();
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

  it('counts a wrong current password as a failed attempt', async () => {
    compareMock.mockResolvedValue(false);
    const { service, prisma } = await createService(createAdmin());

    await expect(
      service.changePassword(ADMIN_ID, SESSION_ID, 'wrong', 'new-password-1'),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CREDENTIALS });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(reservationValues(prisma)).toContain(ADMIN_ID);
    expect(hashMock).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ACCOUNT_LOCKED without checking the current password when locked', async () => {
    const lockedUntil = new Date(NOW.getTime() + 60 * 1000);
    const { service, prisma } = await createService(
      createAdmin({ failedLoginCount: 5, lockedUntil }),
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    await expect(
      service.changePassword(
        ADMIN_ID,
        SESSION_ID,
        'current-password',
        'new-password-1',
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      params: { retryAfterSeconds: 60 },
    });
    expect(compareMock).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the login once the current one is verified', async () => {
    compareMock.mockResolvedValue(true);
    const { service, prisma } = await createService(
      createAdmin({ login: 'owner-login-long' }),
    );

    await expect(
      service.changePassword(
        ADMIN_ID,
        SESSION_ID,
        'current-password',
        'Owner-Login-Long',
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      fields: [{ path: 'newPassword', code: 'SAME_AS_LOGIN' }],
    });
    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: ADMIN_ID },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    expect(hashMock).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores the new hash and deletes the other sessions in one transaction', async () => {
    compareMock.mockResolvedValue(true);
    const { service, prisma, sessionService } = await createService(
      createAdmin(),
    );

    await service.changePassword(
      ADMIN_ID,
      SESSION_ID,
      'current-password',
      'new-password-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.admin.update).toHaveBeenCalledWith({
      where: { id: ADMIN_ID },
      data: { passwordHash: 'hashed-password' },
    });
    expect(sessionService.deleteAllForAdmin).toHaveBeenCalledWith(
      ADMIN_ID,
      SESSION_ID,
      prisma.tx,
    );
  });
});
