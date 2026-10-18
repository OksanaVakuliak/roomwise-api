import type { Configuration, PricingData } from '@roomwise/calc-engine';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { generateConfigurations } from '../../../../packages/calc-engine/test/generate-fixtures';
import { Clock } from '../../src/common/clock/clock';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { RateSource } from '../../src/generated/prisma/enums';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const MAINTENANCE_TOKEN = process.env.MAINTENANCE_TOKEN as string;
const MAINTENANCE_PATH = '/api/v1/internal/maintenance/run';
const RATE_PATH = '/api/v1/admin/pricing/exchange-rate';
const MANUAL_PATH = `${RATE_PATH}/manual`;
const PRICING_DATA_PATH = '/api/v1/public/pricing-data';
const ESTIMATES_PATH = '/api/v1/public/estimates';
const TASK_NAME = 'exchange-rate-refresh';
const BASE_TIME = new Date('2026-09-14T09:00:00.000Z').getTime();
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const NBU_RATE = 41.5;
const NBU_DATE = '14.09.2026';
const NBU_ISO_DATE = '2026-09-14';
const STALE_DATE = '2026-09-10';
const GENERATOR_SEED = 20_260_918;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

function nbuBody(rate = NBU_RATE, date = NBU_DATE) {
  return [{ r030: 840, txt: 'Долар США', rate, cc: 'USD', exchangedate: date }];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('exchange rate e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;
  let configuration: Configuration;
  let now = BASE_TIME;
  let testIndex = 0;
  let fetchMock: ReturnType<typeof mockFetch>;

  function mockFetch() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      overrides: [{ provide: Clock, useValue: { now: () => new Date(now) } }],
    });

    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(CatalogDatasetService).upsert(catalogDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(PricingDatasetService).upsert(pricingDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );

    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);

    const response = await request(testApp.http)
      .get(PRICING_DATA_PATH)
      .expect(200);
    configuration = generateConfigurations(
      response.body as PricingData,
      GENERATOR_SEED,
      1,
    )[0];
  });

  beforeEach(async () => {
    fetchMock = mockFetch();
    testIndex += 1;
    now = BASE_TIME + testIndex * 2 * DAY_MS;

    await testApp.prisma.pricingSettings.updateMany({
      data: {
        manualRateId: null,
        lastNbuSuccessDate: null,
        lastNbuAttemptAt: null,
        lastNbuError: null,
      },
    });
    await testApp.prisma.exchangeRate.deleteMany();
    testApp.app.get(PricingDataService).invalidate();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  afterAll(async () => {
    await testApp.close();
  });

  function authed(method: 'get' | 'put' | 'delete', path: string) {
    return request(testApp.http)[method](path).set('Cookie', adminCookie);
  }

  async function runTask() {
    const response = await request(testApp.http)
      .post(MAINTENANCE_PATH)
      .set('x-maintenance-token', MAINTENANCE_TOKEN)
      .expect(200);

    return (
      response.body.tasks as Array<{ name: string; status: string }>
    ).find((task) => task.name === TASK_NAME);
  }

  async function estimateIn(currency: 'USD' | 'UAH') {
    const response = await request(testApp.http)
      .post(ESTIMATES_PATH)
      .send({ configuration: { ...configuration, currency } })
      .expect(200);

    return response.body.estimate;
  }

  function today() {
    return new Date(now).toISOString().slice(0, 10);
  }

  async function seedOfficialRate(rate: string, date: string) {
    await testApp.prisma.exchangeRate.create({
      data: {
        source: RateSource.NBU,
        rate,
        effectiveDate: new Date(date),
        fetchedAt: new Date(date),
      },
    });
    await testApp.prisma.pricingSettings.updateMany({
      data: { lastNbuSuccessDate: new Date(date) },
    });
  }

  describe('NBU refresh task', () => {
    it('stores the rate with its date and reports it as the NBU source', async () => {
      fetchMock.mockResolvedValue(jsonResponse(nbuBody()));

      const task = await runTask();
      const response = await authed('get', RATE_PATH).expect(200);

      expect(task?.status).toBe('SUCCESS');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('valcode=USD');
      expect(response.body).toEqual({
        active: { rate: '41.5000', date: NBU_ISO_DATE, source: 'NBU' },
        official: { rate: '41.5000', date: NBU_ISO_DATE },
        manual: null,
        lastSuccessfulFetchDate: today(),
        lastAttemptAt: new Date(now).toISOString(),
        lastError: null,
        staleSince: null,
      });
    });

    it('is not due again once today has a successful fetch', async () => {
      fetchMock.mockResolvedValue(jsonResponse(nbuBody()));

      await runTask();
      const second = await runTask();

      expect(second?.status).toBe('SKIPPED_NOT_DUE');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('manual override', () => {
    beforeEach(async () => {
      await seedOfficialRate('41.5000', NBU_ISO_DATE);
    });

    it('takes priority with the MANUAL source and DELETE returns to NBU', async () => {
      const put = await authed('put', MANUAL_PATH)
        .send({ rate: '45.1' })
        .expect(200);

      expect(put.body.active).toEqual({
        rate: '45.1000',
        date: today(),
        source: 'MANUAL',
      });
      expect(put.body.manual).toEqual({ rate: '45.1000', date: today() });
      expect(put.body.official).toEqual({
        rate: '41.5000',
        date: NBU_ISO_DATE,
      });

      const removed = await authed('delete', MANUAL_PATH).expect(200);

      expect(removed.body.manual).toBeNull();
      expect(removed.body.active).toEqual({
        rate: '41.5000',
        date: NBU_ISO_DATE,
        source: 'NBU',
      });
      expect(await testApp.prisma.exchangeRate.count()).toBe(1);
    });

    it('replaces an earlier manual rate instead of accumulating rows', async () => {
      await authed('put', MANUAL_PATH).send({ rate: '44' }).expect(200);
      await authed('put', MANUAL_PATH).send({ rate: '46.25' }).expect(200);

      const response = await authed('get', RATE_PATH).expect(200);

      expect(response.body.manual.rate).toBe('46.2500');
      expect(
        await testApp.prisma.exchangeRate.count({
          where: { source: RateSource.MANUAL },
        }),
      ).toBe(1);
    });

    it.each(['0', '-1', '1.23456', 'abc'])(
      'rejects the manual rate %j with VALIDATION_FAILED',
      async (rate) => {
        const response = await authed('put', MANUAL_PATH)
          .send({ rate })
          .expect(400);

        expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      },
    );

    it('rejects a numeric rate', async () => {
      await authed('put', MANUAL_PATH).send({ rate: 45.1 }).expect(400);
    });

    it('is reflected by the public pricing data and estimates right after PUT and DELETE', async () => {
      const before = await request(testApp.http)
        .get(PRICING_DATA_PATH)
        .expect(200);

      expect(before.body.exchangeRate.rate).toBe('41.5000');

      await authed('put', MANUAL_PATH).send({ rate: '45.1' }).expect(200);

      const after = await request(testApp.http)
        .get(PRICING_DATA_PATH)
        .expect(200);
      const estimate = await estimateIn('UAH');

      expect(after.body.exchangeRate.rate).toBe('45.1000');
      expect(after.body.version).not.toBe(before.body.version);
      expect(estimate.exchangeRate.rate).toBe('45.1000');

      await authed('delete', MANUAL_PATH).expect(200);

      const restored = await request(testApp.http)
        .get(PRICING_DATA_PATH)
        .expect(200);

      expect(restored.body.exchangeRate.rate).toBe('41.5000');
      expect(restored.body.version).toBe(before.body.version);
    });
  });

  describe('NBU failure', () => {
    beforeEach(async () => {
      await seedOfficialRate('40.1234', STALE_DATE);
    });

    it.each([
      ['an HTTP 500', () => jsonResponse({}, 500), 'HTTP 500'],
      ['a bad response shape', () => jsonResponse({ rate: 1 }), 'shape'],
      ['a missing USD entry', () => jsonResponse([]), 'no USD'],
      ['a bad date', () => jsonResponse(nbuBody(41, '2026-09-14')), 'date'],
    ])(
      'keeps the last rate and records the error on %s',
      async (_, respond, text) => {
        fetchMock.mockImplementation(async () => respond());

        const task = await runTask();
        const response = await authed('get', RATE_PATH).expect(200);

        expect(task?.status).toBe('FAILED');
        expect(response.body.active).toEqual({
          rate: '40.1234',
          date: STALE_DATE,
          source: 'NBU',
        });
        expect(response.body.lastError).toContain(text);
        expect(response.body.staleSince).toBe(STALE_DATE);
        expect(response.body.lastSuccessfulFetchDate).toBe(STALE_DATE);
        expect(response.body.lastAttemptAt).toBe(new Date(now).toISOString());
      },
    );

    it('keeps the last rate when the request times out', async () => {
      fetchMock.mockRejectedValue(
        new DOMException('The operation timed out', 'TimeoutError'),
      );

      await runTask();
      const response = await authed('get', RATE_PATH).expect(200);

      expect(response.body.active.rate).toBe('40.1234');
      expect(response.body.lastError).toContain('did not respond');
      expect(response.body.staleSince).toBe(STALE_DATE);
    });

    it('clears the error after a later successful fetch', async () => {
      await runTask();

      now += 2 * HOUR_MS;
      fetchMock.mockResolvedValue(jsonResponse(nbuBody()));
      await runTask();
      const response = await authed('get', RATE_PATH).expect(200);

      expect(response.body.lastError).toBeNull();
      expect(response.body.staleSince).toBeNull();
      expect(response.body.active.rate).toBe('41.5000');
    });

    it('does not stop a USD estimate while NBU is down', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));

      const estimate = await estimateIn('USD');

      expect(estimate.totals.usdCents).toBeGreaterThan(0);
      expect(estimate.exchangeRate.rate).toBe('40.1234');
    });
  });

  describe('without any rate', () => {
    it('still computes USD totals and leaves the UAH amounts empty', async () => {
      const estimate = await estimateIn('UAH');

      expect(estimate.exchangeRate).toBeNull();
      expect(estimate.totals.usdCents).toBeGreaterThan(0);
      expect(estimate.totals.uahKopecks).toBeNull();
      expect(
        estimate.lines.every(
          (line: { amountUahKopecks: number | null }) =>
            line.amountUahKopecks === null,
        ),
      ).toBe(true);
    });
  });

  describe('authentication', () => {
    it.each([
      ['get', RATE_PATH],
      ['put', MANUAL_PATH],
      ['delete', MANUAL_PATH],
    ] as const)(
      'answers 401 to %s %s without a session',
      async (method, path) => {
        const response = await request(testApp.http)[method](path).send({
          rate: '45.1',
        });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
      },
    );
  });
});
