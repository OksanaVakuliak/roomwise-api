import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session-cookie';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, extractSessionCookie, login } from './auth-helpers';

const ONE_MINUTE_MS = 60_000;
const EIGHT_HOURS_MS = 28_800_000;
const SEVEN_DAYS_MS = 604_800_000;
const LOGIN_RATE_LIMIT = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 900;
const WRONG_PASSWORD = 'not-the-real-password';
const NEW_PASSWORD = 'New-Sup3rSecret1!';
const TOO_SHORT_PASSWORD = 'short1!';

function findSessionCookieHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

describe('auth e2e', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('rejects an admin action without a session with UNAUTHENTICATED', async () => {
    const response = await request(testApp.http).get('/api/v1/admin/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: ERROR_CODES.UNAUTHENTICATED },
    });
  });

  it('rejects a garbage session cookie with UNAUTHENTICATED', async () => {
    const response = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', 'rw_session=garbage');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: ERROR_CODES.UNAUTHENTICATED },
    });
  });

  it('logs in, reads me, logs out, and invalidates the old session', async () => {
    const admin = await createAdmin(testApp.prisma);

    const loginResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: admin.password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toEqual({
      id: admin.id,
      login: admin.login,
      isDemo: false,
      sandbox: null,
      demoLimits: null,
    });

    const sessionCookieHeader = findSessionCookieHeader(loginResponse.headers);
    expect(sessionCookieHeader).toBeDefined();
    expect(sessionCookieHeader).toContain('HttpOnly');
    expect(sessionCookieHeader).toContain('Secure');
    expect(sessionCookieHeader).toContain('SameSite=Strict');
    expect(sessionCookieHeader).toContain('Path=/api');

    const cookie = extractSessionCookie(loginResponse);

    const meResponse = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', cookie);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toEqual({
      id: admin.id,
      login: admin.login,
      isDemo: false,
      sandbox: null,
      demoLimits: null,
    });

    const logoutResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookie);

    expect(logoutResponse.status).toBe(204);
    const clearedCookie = findSessionCookieHeader(logoutResponse.headers);
    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toMatch(/rw_session=;/);

    const meAfterLogout = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', cookie);

    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body).toEqual({
      error: { code: ERROR_CODES.UNAUTHENTICATED },
    });
  });

  it('accepts a login regardless of case', async () => {
    const admin = await createAdmin(testApp.prisma, { login: 'owner' });

    const response = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: 'OWNER', password: admin.password });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(admin.id);
  });

  it('returns an identical INVALID_CREDENTIALS body for unknown login and wrong password', async () => {
    const admin = await createAdmin(testApp.prisma);

    const unknownLoginResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: 'no-such-admin', password: WRONG_PASSWORD });

    const wrongPasswordResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: WRONG_PASSWORD });

    expect(unknownLoginResponse.status).toBe(401);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownLoginResponse.body).toEqual({
      error: { code: ERROR_CODES.INVALID_CREDENTIALS },
    });
    expect(unknownLoginResponse.body).toEqual(wrongPasswordResponse.body);
  });

  it('locks the account after 5 failed attempts and unlocks once lockedUntil passes', async () => {
    const admin = await createAdmin(testApp.prisma);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(testApp.http)
        .post('/api/v1/admin/auth/login')
        .send({ login: admin.login, password: WRONG_PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: ERROR_CODES.INVALID_CREDENTIALS },
      });
    }

    const lockedRow = await testApp.prisma.admin.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(lockedRow.failedLoginCount).toBe(MAX_FAILED_ATTEMPTS);
    expect(lockedRow.lockedUntil).not.toBeNull();

    const lockedResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: admin.password });

    expect(lockedResponse.status).toBe(423);
    expect(lockedResponse.body.error.code).toBe(ERROR_CODES.ACCOUNT_LOCKED);
    const retryAfterSeconds =
      lockedResponse.body.error.params.retryAfterSeconds;
    expect(typeof retryAfterSeconds).toBe('number');
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(LOCKOUT_DURATION_SECONDS);

    await testApp.prisma.admin.update({
      where: { id: admin.id },
      data: { lockedUntil: new Date(Date.now() - ONE_MINUTE_MS) },
    });

    const unlockedResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: admin.password });

    expect(unlockedResponse.status).toBe(200);

    const adminRow = await testApp.prisma.admin.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(adminRow.failedLoginCount).toBe(0);
  });

  it('invalidates a session after 8 hours of inactivity and deletes its row', async () => {
    const admin = await createAdmin(testApp.prisma);
    const cookie = await login(testApp.http, admin.login, admin.password);

    const sessionsBeforeExpiry = await testApp.prisma.adminSession.findMany({
      where: { adminId: admin.id },
    });
    expect(sessionsBeforeExpiry).toHaveLength(1);
    const sessionId = sessionsBeforeExpiry[0].id;

    await testApp.prisma.adminSession.update({
      where: { id: sessionId },
      data: {
        lastSeenAt: new Date(Date.now() - EIGHT_HOURS_MS - ONE_MINUTE_MS),
      },
    });

    const meAfterExpiry = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', cookie);

    expect(meAfterExpiry.status).toBe(401);
    expect(meAfterExpiry.body).toEqual({
      error: { code: ERROR_CODES.UNAUTHENTICATED },
    });

    const sessionAfterExpiry = await testApp.prisma.adminSession.findUnique({
      where: { id: sessionId },
    });
    expect(sessionAfterExpiry).toBeNull();
  });

  it('invalidates a session 7 days after it was created', async () => {
    const admin = await createAdmin(testApp.prisma);
    const cookie = await login(testApp.http, admin.login, admin.password);

    const sessions = await testApp.prisma.adminSession.findMany({
      where: { adminId: admin.id },
    });
    const sessionId = sessions[0].id;

    await testApp.prisma.adminSession.update({
      where: { id: sessionId },
      data: {
        createdAt: new Date(Date.now() - SEVEN_DAYS_MS - ONE_MINUTE_MS),
        lastSeenAt: new Date(),
      },
    });

    const response = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', cookie);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: ERROR_CODES.UNAUTHENTICATED },
    });
  });

  it('changes the password, invalidates other sessions, keeps the current one working', async () => {
    const admin = await createAdmin(testApp.prisma);
    const primaryCookie = await login(
      testApp.http,
      admin.login,
      admin.password,
    );
    const secondaryCookie = await login(
      testApp.http,
      admin.login,
      admin.password,
    );

    const wrongCurrentResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/password')
      .set('Cookie', primaryCookie)
      .send({ currentPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });

    expect(wrongCurrentResponse.status).toBe(401);
    expect(wrongCurrentResponse.body).toEqual({
      error: { code: ERROR_CODES.INVALID_CREDENTIALS },
    });

    const tooShortResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/password')
      .set('Cookie', primaryCookie)
      .send({
        currentPassword: admin.password,
        newPassword: TOO_SHORT_PASSWORD,
      });

    expect(tooShortResponse.status).toBe(400);
    expect(tooShortResponse.body.error.code).toBe(
      ERROR_CODES.VALIDATION_FAILED,
    );

    const successResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/password')
      .set('Cookie', primaryCookie)
      .send({ currentPassword: admin.password, newPassword: NEW_PASSWORD });

    expect(successResponse.status).toBe(204);

    const oldPasswordLogin = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: admin.password });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: NEW_PASSWORD });
    expect(newPasswordLogin.status).toBe(200);

    const secondarySessionMe = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', secondaryCookie);
    expect(secondarySessionMe.status).toBe(401);

    const primarySessionMe = await request(testApp.http)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', primaryCookie);
    expect(primarySessionMe.status).toBe(200);
  });

  it('forbids a demo admin from changing their password', async () => {
    const admin = await createAdmin(testApp.prisma, { isDemo: true });
    const cookie = await login(testApp.http, admin.login, admin.password);

    const response = await request(testApp.http)
      .post('/api/v1/admin/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword: admin.password, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: ERROR_CODES.DEMO_FORBIDDEN,
        params: { action: 'change-password' },
      },
    });
  });

  it('starts a fresh count when a wrong password follows an expired lock', async () => {
    const admin = await createAdmin(testApp.prisma);
    await testApp.prisma.admin.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: MAX_FAILED_ATTEMPTS,
        lockedUntil: new Date(Date.now() - ONE_MINUTE_MS),
      },
    });

    const response = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: WRONG_PASSWORD });

    expect(response.status).toBe(401);
    const adminRow = await testApp.prisma.admin.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(adminRow.failedLoginCount).toBe(1);
    expect(adminRow.lockedUntil).toBeNull();
  });

  it('locks after at most 5 checked passwords under concurrent attempts', async () => {
    const admin = await createAdmin(testApp.prisma);

    const responses = await Promise.all(
      Array.from({ length: LOGIN_RATE_LIMIT }, () =>
        request(testApp.http)
          .post('/api/v1/admin/auth/login')
          .send({ login: admin.login, password: WRONG_PASSWORD }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    const rejected = statuses.filter((status) => status === 401).length;
    const locked = statuses.filter((status) => status === 423).length;

    expect(rejected).toBeLessThanOrEqual(MAX_FAILED_ATTEMPTS);
    expect(rejected + locked).toBe(LOGIN_RATE_LIMIT);

    const adminRow = await testApp.prisma.admin.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(adminRow.failedLoginCount).toBeLessThanOrEqual(MAX_FAILED_ATTEMPTS);
    expect(adminRow.lockedUntil).not.toBeNull();
  });

  it('clears the cookie and deletes the session on logout even when the session has expired', async () => {
    const admin = await createAdmin(testApp.prisma);
    const cookie = await login(testApp.http, admin.login, admin.password);

    await testApp.prisma.adminSession.updateMany({
      where: { adminId: admin.id },
      data: {
        lastSeenAt: new Date(Date.now() - EIGHT_HOURS_MS - ONE_MINUTE_MS),
      },
    });

    const response = await request(testApp.http)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookie);

    expect(response.status).toBe(204);
    expect(findSessionCookieHeader(response.headers)).toMatch(/rw_session=;/);

    const sessions = await testApp.prisma.adminSession.findMany({
      where: { adminId: admin.id },
    });
    expect(sessions).toHaveLength(0);
  });

  it('clears the cookie on logout without a session', async () => {
    const response = await request(testApp.http).post(
      '/api/v1/admin/auth/logout',
    );

    expect(response.status).toBe(204);
    expect(findSessionCookieHeader(response.headers)).toMatch(/rw_session=;/);
  });

  it('locks password change after 5 wrong current passwords', async () => {
    const admin = await createAdmin(testApp.prisma);
    const cookie = await login(testApp.http, admin.login, admin.password);

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      const response = await request(testApp.http)
        .post('/api/v1/admin/auth/password')
        .set('Cookie', cookie)
        .send({ currentPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: ERROR_CODES.INVALID_CREDENTIALS },
      });
    }

    const lockedResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword: admin.password, newPassword: NEW_PASSWORD });

    expect(lockedResponse.status).toBe(423);
    expect(lockedResponse.body.error.code).toBe(ERROR_CODES.ACCOUNT_LOCKED);

    const lockedLogin = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: admin.password });
    expect(lockedLogin.status).toBe(423);
  });

  it('rejects a new password equal to the login', async () => {
    const admin = await createAdmin(testApp.prisma);
    const cookie = await login(testApp.http, admin.login, admin.password);

    const response = await request(testApp.http)
      .post('/api/v1/admin/auth/password')
      .set('Cookie', cookie)
      .send({
        currentPassword: admin.password,
        newPassword: admin.login.toUpperCase(),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        fields: [{ path: 'newPassword', code: 'SAME_AS_LOGIN' }],
      },
    });

    const adminRow = await testApp.prisma.admin.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(adminRow.failedLoginCount).toBe(0);
  });

  it('rate limits login after 10 requests per IP within the window', async () => {
    const admin = await createAdmin(testApp.prisma);

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      const response = await request(testApp.http)
        .post('/api/v1/admin/auth/login')
        .send({ login: admin.login, password: WRONG_PASSWORD });

      expect(response.status).not.toBe(429);
    }

    const rateLimitedResponse = await request(testApp.http)
      .post('/api/v1/admin/auth/login')
      .send({ login: admin.login, password: WRONG_PASSWORD });

    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
  });
});
