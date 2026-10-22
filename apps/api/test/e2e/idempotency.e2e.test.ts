import { randomUUID } from 'node:crypto';
import { Body, Controller, Module, OnModuleInit, Post } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PublicWriteLimit } from '../../src/common/throttling/public-write-limit.decorator';
import { PUBLIC_WRITE_LIMITS_PER_HOUR } from '../../src/common/throttling/public-write-throttle.constants';
import { IdempotencyScope } from '../../src/generated/prisma/enums';
import { Public } from '../../src/modules/auth/public.decorator';
import { IdempotencyService } from '../../src/modules/projects/idempotency/idempotency.service';
import { type IdempotencyContextValue } from '../../src/modules/projects/idempotency/idempotency-request';
import {
  IdempotencyContext,
  Idempotent,
} from '../../src/modules/projects/idempotency/idempotent.decorator';
import { ProjectsModule } from '../../src/modules/projects/projects.module';
import { createTestApp, type TestApp } from './app-factory';

const HEADER = 'Idempotency-Key';
const ENDPOINT = '/api/v1/test-idempotency';
const SAVES_LIMIT = PUBLIC_WRITE_LIMITS_PER_HOUR.saves;
const REPLAY_COUNT = 25;

const handlerCalls = { count: 0 };

@Controller('test-idempotency')
class IdempotencyTestController implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  onModuleInit(): void {
    this.idempotency.registerLoader(IdempotencyScope.SAVE, async (row) => ({
      status: 201,
      body: { id: row.resultId },
    }));
  }

  @Post()
  @Public()
  @Idempotent(IdempotencyScope.SAVE)
  @PublicWriteLimit('saves')
  async create(
    @Body() _body: unknown,
    @IdempotencyContext() context: IdempotencyContextValue,
  ) {
    handlerCalls.count += 1;
    const resultId = randomUUID();

    await this.prisma.$transaction((tx) =>
      this.idempotency.record(tx, { ...context, resultId }),
    );

    return { id: resultId };
  }
}

@Module({
  imports: [ProjectsModule],
  controllers: [IdempotencyTestController],
})
class IdempotencyTestModule {}

function post(testApp: TestApp, key: string | undefined, body: object) {
  const req = request(testApp.http).post(ENDPOINT);

  return (key === undefined ? req : req.set(HEADER, key)).send(body);
}

describe('idempotency e2e', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    handlerCalls.count = 0;
    testApp = await createTestApp({ imports: [IdempotencyTestModule] });
  });

  afterEach(async () => {
    await testApp.prisma.idempotencyKey.deleteMany();
    await testApp.close();
  });

  it.each([undefined, 'not-a-uuid'])(
    'answers 428 for header %s',
    async (key) => {
      const response = await post(testApp, key, { a: 1 });

      expect(response.status).toBe(428);
      expect(response.body.error.code).toBe(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      );
      expect(handlerCalls.count).toBe(0);
    },
  );

  it('runs the handler once and replays the first response', async () => {
    const key = randomUUID();

    const first = await post(testApp, key, { a: 1, b: { c: 2, d: 3 } });
    expect(first.status).toBe(201);

    const replay = await post(testApp, key, { b: { d: 3, c: 2 }, a: 1 });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(handlerCalls.count).toBe(1);
  });

  it('answers 422 when the key is reused with another body', async () => {
    const key = randomUUID();
    await post(testApp, key, { a: 1 });

    const response = await post(testApp, key, { a: 2 });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    expect(handlerCalls.count).toBe(1);
  });

  it('does not spend the saves limit on replays', async () => {
    const key = randomUUID();
    await post(testApp, key, { a: 1 });

    for (let i = 0; i < REPLAY_COUNT; i++) {
      expect((await post(testApp, key, { a: 1 })).status).toBe(201);
    }

    expect(handlerCalls.count).toBe(1);
  });

  it('limits distinct keys to the saves budget', async () => {
    for (let i = 0; i < SAVES_LIMIT; i++) {
      expect((await post(testApp, randomUUID(), { a: i })).status).toBe(201);
    }

    const blocked = await post(testApp, randomUUID(), { a: 'over' });
    expect(blocked.status).toBe(429);
  });
});
