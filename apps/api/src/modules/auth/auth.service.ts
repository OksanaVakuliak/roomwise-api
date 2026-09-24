import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppError } from '../../common/http/app-error';
import { ERROR_CODES } from '../../common/http/error-codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Admin } from '../../generated/prisma/client';
import { type AdminMe, isPasswordSameAsLogin } from './auth.schemas';
import { Clock } from './clock';
import { hashPassword, verifyPassword } from './password-hasher';
import { SessionService } from './session.service';

const DUMMY_PASSWORD = 'roomwise-dummy-password-for-timing-safety';
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 900_000;
const MS_PER_SECOND = 1000;
const SAME_AS_LOGIN_FIELD_CODE = 'SAME_AS_LOGIN';

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

    await this.verifyWithLockout(admin, password);

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

    await this.verifyWithLockout(admin, currentPassword);

    if (isPasswordSameAsLogin(newPassword, admin.login)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        fields: [{ path: 'newPassword', code: SAME_AS_LOGIN_FIELD_CODE }],
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: adminId },
        data: { passwordHash },
      });
      await this.sessionService.deleteAllForAdmin(adminId, sessionId, tx);
    });
  }

  private async verifyWithLockout(
    admin: Admin,
    password: string,
  ): Promise<void> {
    const now = this.clock.now();
    const reserved = await this.reserveAttempt(admin.id, now);
    if (!reserved) {
      throw new AppError(ERROR_CODES.ACCOUNT_LOCKED, {
        params: { retryAfterSeconds: await this.retryAfterSeconds(admin.id) },
      });
    }

    const passwordMatches = await verifyPassword(password, admin.passwordHash);
    if (!passwordMatches) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  private async reserveAttempt(adminId: string, now: Date): Promise<boolean> {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE admins
      SET failed_login_count = CASE
          WHEN locked_until IS NULL THEN failed_login_count + 1
          ELSE 1
        END,
        locked_until = CASE
          WHEN locked_until IS NULL
            AND failed_login_count + 1 >= ${MAX_FAILED_LOGIN_ATTEMPTS}::int
            THEN ${lockedUntil}::timestamptz
          ELSE NULL
        END
      WHERE id = ${adminId}::uuid
        AND (locked_until IS NULL OR locked_until <= ${now}::timestamptz)
      RETURNING id
    `;

    return rows.length > 0;
  }

  private async retryAfterSeconds(adminId: string): Promise<number> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { lockedUntil: true },
    });
    const remainingMs = admin?.lockedUntil
      ? admin.lockedUntil.getTime() - this.clock.now().getTime()
      : LOCKOUT_DURATION_MS;

    return Math.ceil(Math.max(remainingMs, MS_PER_SECOND) / MS_PER_SECOND);
  }
}
