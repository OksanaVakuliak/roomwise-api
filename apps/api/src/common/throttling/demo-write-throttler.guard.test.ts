import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedAdmin } from '../../modules/auth/current-admin.decorator';
import { DemoWriteThrottlerGuard } from './demo-write-throttler.guard';

const DEMO_ADMIN: AuthenticatedAdmin = {
  id: 'demo-admin-id',
  login: 'demo',
  isDemo: true,
  sessionId: 'session-1',
};

const REAL_ADMIN: AuthenticatedAdmin = {
  id: 'real-admin-id',
  login: 'alice',
  isDemo: false,
  sessionId: 'session-2',
};

function createContext(options: {
  method: string;
  path: string;
  admin?: AuthenticatedAdmin;
}): ExecutionContext {
  const request = {
    method: options.method,
    path: options.path,
    url: options.path,
    headers: {},
    admin: options.admin,
  };
  const response = {
    header: vi.fn(),
    getHeader: vi.fn(),
  };

  return {
    getHandler: () => ({ name: 'handler' }),
    getClass: () => ({ name: 'Controller' }),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createReflector(): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(undefined),
  } as unknown as Reflector;
}

async function createGuard(): Promise<DemoWriteThrottlerGuard> {
  const guard = new DemoWriteThrottlerGuard(
    [],
    new ThrottlerStorageService(),
    createReflector(),
  );

  await guard.onModuleInit();

  return guard;
}

describe('DemoWriteThrottlerGuard', () => {
  let guard: DemoWriteThrottlerGuard;

  beforeEach(async () => {
    guard = await createGuard();
  });

  it('counts a demo admin mutation against demo-writes', async () => {
    const context = createContext({
      method: 'POST',
      path: '/api/v1/admin/categories',
      admin: DEMO_ADMIN,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const storage = (
      guard as unknown as { storageService: ThrottlerStorageService }
    ).storageService;
    const record = storage.storage.get(`demo-writes:${DEMO_ADMIN.id}`);
    expect(record?.totalHits.get('demo-writes')).toBe(1);
    expect(storage.storage.has(`demo-uploads:${DEMO_ADMIN.id}`)).toBe(false);
  });

  it('skips a non-demo admin entirely', async () => {
    const context = createContext({
      method: 'POST',
      path: '/api/v1/admin/categories',
      admin: REAL_ADMIN,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const storage = (
      guard as unknown as { storageService: ThrottlerStorageService }
    ).storageService;
    expect(storage.storage.size).toBe(0);
  });

  it('skips a GET request', async () => {
    const context = createContext({
      method: 'GET',
      path: '/api/v1/admin/categories',
      admin: DEMO_ADMIN,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const storage = (
      guard as unknown as { storageService: ThrottlerStorageService }
    ).storageService;
    expect(storage.storage.size).toBe(0);
  });

  it('skips a request with no authenticated admin', async () => {
    const context = createContext({
      method: 'POST',
      path: '/api/v1/admin/auth/login',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const storage = (
      guard as unknown as { storageService: ThrottlerStorageService }
    ).storageService;
    expect(storage.storage.size).toBe(0);
  });

  it('counts an image upload against both demo-writes and demo-uploads', async () => {
    const context = createContext({
      method: 'POST',
      path: '/api/v1/admin/images',
      admin: DEMO_ADMIN,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const storage = (
      guard as unknown as { storageService: ThrottlerStorageService }
    ).storageService;
    expect(
      storage.storage
        .get(`demo-writes:${DEMO_ADMIN.id}`)
        ?.totalHits.get('demo-writes'),
    ).toBe(1);
    expect(
      storage.storage
        .get(`demo-uploads:${DEMO_ADMIN.id}`)
        ?.totalHits.get('demo-uploads'),
    ).toBe(1);
  });

  it('tracks a demo admin by their id', async () => {
    const request = { admin: DEMO_ADMIN };
    const tracker = await (
      guard as unknown as {
        getTracker: (req: typeof request) => Promise<string>;
      }
    ).getTracker(request);

    expect(tracker).toBe(DEMO_ADMIN.id);
  });

  it('throws once the demo-writes limit is exceeded', async () => {
    const context = createContext({
      method: 'DELETE',
      path: '/api/v1/admin/products/1',
      admin: DEMO_ADMIN,
    });

    for (let i = 0; i < 60; i += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });
});
