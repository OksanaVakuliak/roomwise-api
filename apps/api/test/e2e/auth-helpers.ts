import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request, { type Response as SupertestResponse } from 'supertest';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import { hashPassword } from '../../src/modules/auth/password-hasher';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/session-cookie';

const LOW_BCRYPT_COST = 4;
const DEFAULT_PASSWORD = 'Sup3rSecret1!';

export interface CreateAdminOptions {
  login?: string;
  password?: string;
  isDemo?: boolean;
}

export interface CreatedAdmin {
  id: string;
  login: string;
  password: string;
  isDemo: boolean;
}

export async function createAdmin(
  prisma: PrismaService,
  options: CreateAdminOptions = {},
): Promise<CreatedAdmin> {
  const login = options.login ?? `admin-${randomUUID().slice(0, 8)}`;
  const password = options.password ?? DEFAULT_PASSWORD;
  const isDemo = options.isDemo ?? false;
  const passwordHash = await hashPassword(password, LOW_BCRYPT_COST);

  const admin = await prisma.admin.create({
    data: { login, passwordHash, isDemo },
  });

  return { id: admin.id, login: admin.login, password, isDemo: admin.isDemo };
}

export function extractSessionCookie(response: SupertestResponse): string {
  const rawCookies = response.headers['set-cookie'] as
    | string[]
    | string
    | undefined;
  const cookies = Array.isArray(rawCookies)
    ? rawCookies
    : rawCookies
      ? [rawCookies]
      : [];
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${SESSION_COOKIE_NAME}=`),
  );

  if (!sessionCookie) {
    throw new Error(`${SESSION_COOKIE_NAME} cookie not found in response`);
  }

  return sessionCookie.split(';')[0];
}

export async function login(
  http: Server,
  loginValue: string,
  password: string,
): Promise<string> {
  const response = await request(http)
    .post('/api/v1/admin/auth/login')
    .send({ login: loginValue, password });

  return extractSessionCookie(response);
}
