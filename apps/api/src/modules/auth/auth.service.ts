import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppError } from '../../common/http/app-error';
import { ERROR_CODES } from '../../common/http/error-codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Admin } from '../../generated/prisma/client';
import type { AdminMe } from './auth.schemas';
import { Clock } from './clock';
import { hashPassword, verifyPassword } from './password-hasher';
import { SessionService } from './session.service';

const DUMMY_PASSWORD = 'roomwise-dummy-password-for-timing-safety';
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 900_000;
const MS_PER_SECOND = 1000;

export interface LoginResult {
  admin: AdminMe;
  sessionId: string;
}

export function toAdminMe(
  admin: Pick<Admin, 'id' | 'login' | 'isDemo'>,
): AdminMe {
  return {
    id: admin.id,
    login: admin.login,
    isDemo: admin.isDemo,
    sandbox: null,
    demoLimits: null,
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(DUMMY_PASSWORD);
  }

  async login(login: string, password: string): Promise<LoginResult> {
    const admin = await this.prisma.admin.findUnique({ where: { login } });

    if (!admin) {
      await verifyPassword(password, this.dummyHash);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    const now = this.clock.now();
    if (admin.lockedUntil && admin.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil(
        (admin.lockedUntil.getTime() - now.getTime()) / MS_PER_SECOND,
      );
      throw new AppError(ERROR_CODES.ACCOUNT_LOCKED, {
        params: { retryAfterSeconds },
      });
    }

    const passwordMatches = await verifyPassword(password, admin.passwordHash);
    if (!passwordMatches) {
      await this.registerFailedLogin(admin.id, now);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const session = await this.sessionService.create(admin.id);

    return { admin: toAdminMe(admin), sessionId: session.id };
  }

  async changePassword(
    adminId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED);
    }

    const passwordMatches = await verifyPassword(
      currentPassword,
      admin.passwordHash,
    );
    if (!passwordMatches) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash },
    });

    await this.sessionService.deleteAllForAdmin(adminId, sessionId);
  }

  private async registerFailedLogin(adminId: string, now: Date): Promise<void> {
    const updated = await this.prisma.admin.update({
      where: { id: adminId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (updated.failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await this.prisma.admin.updateMany({
        where: {
          id: adminId,
          failedLoginCount: { gte: MAX_FAILED_LOGIN_ATTEMPTS },
        },
        data: {
          lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS),
          failedLoginCount: 0,
        },
      });
    }
  }
}
