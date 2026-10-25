import { Controller, type ExecutionContext, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROXY_SECRET_HEADER, VERCEL_FORWARDED_FOR_HEADER } from './client-ip';
import { PublicWriteExemption } from './public-write-exemption';
import { PublicWriteLimit } from './public-write-limit.decorator';
import { PUBLIC_WRITE_LIMITS_PER_HOUR } from './public-write-throttle.constants';
import { PublicWriteThrottlerGuard } from './public-write-throttler.guard';

@Controller('test')
class TestController {
  @Post('open')
  open() {
    return { ok: true };
  }

  @Post('saves-a')
  @PublicWriteLimit('saves')
  savesA() {
    return { ok: true };
  }

  @Post('saves-b')
  @PublicWriteLimit('saves')
  savesB() {
    return { ok: true };
  }

  @Post('leads')
  @PublicWriteLimit('leads')
  leads() {
    return { ok: true };
  }
}

async function post(
  app: NestExpressApplication,
  path: string,
  ip?: string,
  headers: Record<string, string> = {},
): Promise<request.Response> {
  const req = request(app.getHttpServer()).post(path).set(headers);

  return ip ? req.set('X-Forwarded-For', ip) : req;
}

async function postMany(
  app: NestExpressApplication,
  paths: string[],
  ip?: string,
): Promise<number[]> {
  const statuses: number[] = [];

  for (const path of paths) {
    statuses.push((await post(app, path, ip)).status);
  }

  return statuses;
}

const EXEMPT_HEADER = 'x-exempt';

const { saves, leads } = PUBLIC_WRITE_LIMITS_PER_HOUR;

const PROXY_SECRET = 'p'.repeat(32);
const CLIENT_A = '203.0.113.1';
const CLIENT_B = '203.0.113.2';
const SPOOFED = '6.6.6.6';
const CLOUDFLARE = '172.70.0.1';
const RENDER_INTERNAL = '10.0.0.5';
const VERCEL_EGRESS = '76.76.21.21';

async function createApp(
  trustProxyHops: number,
  proxySecret?: string,
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
    controllers: [TestController],
    providers: [
      { provide: APP_GUARD, useClass: PublicWriteThrottlerGuard },
      {
        provide: ConfigService,
        useValue: { get: () => proxySecret },
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', trustProxyHops);
  await app.init();

  return app;
}

describe('PublicWriteThrottlerGuard behind Render', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createApp(3);
  });

  afterEach(async () => {
    await app.close();
  });

  it('tracks the client address and ignores a spoofed leftmost entry', async () => {
    const chain = (spoof: string) =>
      `${spoof}, ${CLIENT_A}, ${CLOUDFLARE}, ${RENDER_INTERNAL}`;

    await postMany(app, Array(leads).fill('/test/leads'), chain(SPOOFED));
    expect((await post(app, '/test/leads', chain('7.7.7.7'))).status).toBe(429);
    expect((await post(app, '/test/leads', chain(SPOOFED))).status).toBe(429);
  });

  it('blocks only the client that exhausted the budget', async () => {
    const chain = (client: string) =>
      `${client}, ${CLOUDFLARE}, ${RENDER_INTERNAL}`;

    await postMany(app, Array(leads).fill('/test/leads'), chain(CLIENT_A));

    expect((await post(app, '/test/leads', chain(CLIENT_A))).status).toBe(429);
    expect((await post(app, '/test/leads', chain(CLIENT_B))).status).toBe(201);
  });
});

describe('PublicWriteThrottlerGuard behind Vercel', () => {
  let app: NestExpressApplication;

  const viaVercel = (client: string, secret?: string) =>
    post(
      app,
      '/test/leads',
      `${client}, ${VERCEL_EGRESS}, ${CLOUDFLARE}, ${RENDER_INTERNAL}`,
      {
        [VERCEL_FORWARDED_FOR_HEADER]: client,
        ...(secret ? { [PROXY_SECRET_HEADER]: secret } : {}),
      },
    );

  beforeEach(async () => {
    app = await createApp(3, PROXY_SECRET);
  });

  afterEach(async () => {
    await app.close();
  });

  it('gives two clients behind one Vercel egress separate counters', async () => {
    for (let i = 0; i < leads; i++) {
      expect((await viaVercel(CLIENT_A, PROXY_SECRET)).status).toBe(201);
    }

    expect((await viaVercel(CLIENT_A, PROXY_SECRET)).status).toBe(429);
    expect((await viaVercel(CLIENT_B, PROXY_SECRET)).status).toBe(201);
  });

  it('ignores the Vercel header without the secret', async () => {
    for (let i = 0; i < leads; i++) {
      expect((await viaVercel(`198.51.100.${i + 1}`)).status).toBe(201);
    }

    expect((await viaVercel('198.51.100.200')).status).toBe(429);
  });
});

describe('PublicWriteThrottlerGuard', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [TestController],
      providers: [
        { provide: APP_GUARD, useClass: PublicWriteThrottlerGuard },
        {
          provide: PublicWriteExemption,
          useValue: {
            isExempt: async (context: ExecutionContext) =>
              context
                .switchToHttp()
                .getRequest<Request>()
                .header(EXEMPT_HEADER) === 'yes',
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', 1);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not limit an undecorated route', async () => {
    const statuses = await postMany(app, Array(30).fill('/test/open'));

    expect(statuses.every((status) => status === 201)).toBe(true);
  });

  it('shares one saves budget across routes', async () => {
    const paths = Array.from({ length: saves }, (_, i) =>
      i % 2 === 0 ? '/test/saves-a' : '/test/saves-b',
    );

    const statuses = await postMany(app, paths);
    expect(statuses.every((status) => status === 201)).toBe(true);

    const blocked = await post(app, '/test/saves-a');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    expect((await post(app, '/test/saves-b')).status).toBe(429);
  });

  it('limits leads per hour', async () => {
    const statuses = await postMany(app, Array(leads).fill('/test/leads'));
    expect(statuses.every((status) => status === 201)).toBe(true);

    const blocked = await post(app, '/test/leads');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('keeps saves and leads budgets independent', async () => {
    await postMany(app, Array(leads).fill('/test/leads'));
    expect((await post(app, '/test/leads')).status).toBe(429);
    expect((await post(app, '/test/saves-a')).status).toBe(201);

    await postMany(app, Array(saves - 1).fill('/test/saves-a'));
    expect((await post(app, '/test/saves-a')).status).toBe(429);
    expect((await post(app, '/test/leads')).status).toBe(429);
  });

  it('counts clients separately by forwarded address', async () => {
    await postMany(app, Array(leads).fill('/test/leads'), '203.0.113.1');
    expect((await post(app, '/test/leads', '203.0.113.1')).status).toBe(429);

    expect((await post(app, '/test/leads', '203.0.113.2')).status).toBe(201);
  });

  it('does not count exempt requests against the budget', async () => {
    for (let i = 0; i < saves * 2; i++) {
      const response = await request(app.getHttpServer())
        .post('/test/saves-a')
        .set(EXEMPT_HEADER, 'yes');
      expect(response.status).toBe(201);
    }

    await postMany(app, Array(saves).fill('/test/saves-a'));
    expect((await post(app, '/test/saves-a')).status).toBe(429);

    const exempt = await request(app.getHttpServer())
      .post('/test/saves-a')
      .set(EXEMPT_HEADER, 'yes');
    expect(exempt.status).toBe(201);
  });
});
