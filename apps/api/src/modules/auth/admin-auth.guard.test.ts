import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/http/app-error';
import { ERROR_CODES } from '../../common/http/error-codes';
import { AdminAuthGuard } from './admin-auth.guard';
import type { SessionService, ValidatedSession } from './session.service';
import type { SessionCookieService } from './session-cookie';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createReflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
}

function createSessionCookieService(sid: string | null): SessionCookieService {
  return {
    readSid: vi.fn().mockResolvedValue(sid),
  } as unknown as SessionCookieService;
}

function createSessionService(
  validated: ValidatedSession | null,
): SessionService {
  return {
    validate: vi.fn().mockResolvedValue(validated),
  } as unknown as SessionService;
}

describe('AdminAuthGuard', () => {
  it('passes public routes without checking a cookie', async () => {
    const sessionCookieService = createSessionCookieService(null);
    const guard = new AdminAuthGuard(
      createReflector(true),
      sessionCookieService,
      createSessionService(null),
    );

    const result = await guard.canActivate(createContext({}));

    expect(result).toBe(true);
    expect(sessionCookieService.readSid).not.toHaveBeenCalled();
  });

  it('rejects a request without a session cookie', async () => {
    const guard = new AdminAuthGuard(
      createReflector(false),
      createSessionCookieService(null),
      createSessionService(null),
    );

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      AppError,
    );
  });

  it('rejects a request with an unknown session id', async () => {
    const guard = new AdminAuthGuard(
      createReflector(false),
      createSessionCookieService('sid-1'),
      createSessionService(null),
    );

    try {
      await guard.canActivate(createContext({}));
      throw new Error('Expected guard to throw');
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.UNAUTHENTICATED);
    }
  });

  it('attaches the admin to the request on success', async () => {
    const validated: ValidatedSession = {
      session: {
        id: 'sid-1',
        adminId: 'admin-1',
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      admin: {
        id: 'admin-1',
        login: 'admin',
        passwordHash: 'hash',
        isDemo: true,
        failedLoginCount: 0,
        lockedUntil: null,
        createdAt: new Date(),
      },
    };
    const guard = new AdminAuthGuard(
      createReflector(false),
      createSessionCookieService('sid-1'),
      createSessionService(validated),
    );
    const request: Record<string, unknown> = {};

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.admin).toEqual({
      id: 'admin-1',
      login: 'admin',
      isDemo: true,
      sessionId: 'sid-1',
    });
  });
});
