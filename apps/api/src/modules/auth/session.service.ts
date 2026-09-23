import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Admin, AdminSession } from '../../generated/prisma/client';
import { Clock } from './clock';

const SESSION_ABSOLUTE_TTL_MS = 604_800_000;
const SESSION_INACTIVITY_TTL_MS = 28_800_000;
const LAST_SEEN_REFRESH_THROTTLE_MS = 60_000;

export interface ValidatedSession {
  session: AdminSession;
  admin: Admin;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async create(adminId: string): Promise<AdminSession> {
    return this.prisma.adminSession.create({ data: { adminId } });
  }

  async validate(sid: string): Promise<ValidatedSession | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sid },
      include: { admin: true },
    });

    if (!session) {
      return null;
    }

    const now = this.clock.now();
    if (this.isExpired(session, now)) {
      await this.delete(sid);
      return null;
    }

    await this.refreshLastSeen(session, now);

    const { admin, ...rest } = session;
    return { session: rest, admin };
  }

  async delete(sid: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { id: sid } });
  }

  async deleteAllForAdmin(adminId: string, exceptSid?: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({
      where: {
        adminId,
        ...(exceptSid ? { id: { not: exceptSid } } : {}),
      },
    });
  }

  private isExpired(session: AdminSession, now: Date): boolean {
    const age = now.getTime() - session.createdAt.getTime();
    const inactivity = now.getTime() - session.lastSeenAt.getTime();

    return (
      age > SESSION_ABSOLUTE_TTL_MS || inactivity > SESSION_INACTIVITY_TTL_MS
    );
  }

  private async refreshLastSeen(
    session: AdminSession,
    now: Date,
  ): Promise<void> {
    const sinceLastRefresh = now.getTime() - session.lastSeenAt.getTime();

    if (sinceLastRefresh <= LAST_SEEN_REFRESH_THROTTLE_MS) {
      return;
    }

    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
    session.lastSeenAt = now;
  }
}
