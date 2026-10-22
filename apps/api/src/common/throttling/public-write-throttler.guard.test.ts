import { Controller, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PublicWriteLimit } from './public-write-limit.decorator';
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
): Promise<request.Response> {
  const req = request(app.getHttpServer()).post(path);

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

describe('PublicWriteThrottlerGuard', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: PublicWriteThrottlerGuard }],
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
    const paths = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? '/test/saves-a' : '/test/saves-b',
    );

    const statuses = await postMany(app, paths);
    expect(statuses.every((status) => status === 201)).toBe(true);

    const blocked = await post(app, '/test/saves-a');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    expect((await post(app, '/test/saves-b')).status).toBe(429);
  });

  it('limits leads to five per hour', async () => {
    const statuses = await postMany(app, Array(5).fill('/test/leads'));
    expect(statuses.every((status) => status === 201)).toBe(true);

    const blocked = await post(app, '/test/leads');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('keeps saves and leads budgets independent', async () => {
    await postMany(app, Array(5).fill('/test/leads'));
    expect((await post(app, '/test/leads')).status).toBe(429);
    expect((await post(app, '/test/saves-a')).status).toBe(201);

    await postMany(app, Array(19).fill('/test/saves-a'));
    expect((await post(app, '/test/saves-a')).status).toBe(429);
    expect((await post(app, '/test/leads')).status).toBe(429);
  });

  it('counts clients separately by forwarded address', async () => {
    await postMany(app, Array(5).fill('/test/leads'), '203.0.113.1');
    expect((await post(app, '/test/leads', '203.0.113.1')).status).toBe(429);

    expect((await post(app, '/test/leads', '203.0.113.2')).status).toBe(201);
  });
});
