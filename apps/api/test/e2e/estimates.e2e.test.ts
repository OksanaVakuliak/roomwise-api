import { randomUUID } from 'node:crypto';
import {
  type Configuration,
  convertCentsToKopecks,
  estimate,
  type PricingData,
} from '@roomwise/calc-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateConfigurations } from '../../../../packages/calc-engine/test/generate-fixtures';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { RateSource } from '../../src/generated/prisma/enums';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const CONFIGURATION_COUNT = 50;
const GENERATOR_SEED = 20_260_917;
const RATE = '41.2500';
const FOREIGN_VERSION = 'ffffffffffffffff';
const CACHE_CONTROL_HEADER = 'public, max-age=30';
const OUT_OF_BOUNDS_AREA_OFFSET = 1;
const OUT_OF_BOUNDS_HEIGHT_M = 1;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('estimates e2e', () => {
  let testApp: TestApp;
  let bulkApp: TestApp;
  let data: PricingData;
  let samples: Configuration[];

  beforeAll(async () => {
    testApp = await createTestApp();
    bulkApp = await createTestApp();

    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(CatalogDatasetService).upsert(catalogDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(PricingDatasetService).upsert(pricingDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
    await testApp.prisma.exchangeRate.create({
      data: {
        source: RateSource.NBU,
        rate: RATE,
        effectiveDate: new Date('2026-09-14'),
        fetchedAt: new Date('2026-09-14T00:30:00Z'),
      },
    });
    testApp.app.get(PricingDataService).invalidate();
    bulkApp.app.get(PricingDataService).invalidate();

    const response = await request(testApp.http)
      .get('/api/v1/public/pricing-data')
      .expect(200);
    data = response.body as PricingData;
    samples = generateConfigurations(data, GENERATOR_SEED, CONFIGURATION_COUNT);
  });

  afterAll(async () => {
    await testApp.close();
    await bulkApp.close();
  });

  describe('GET /api/v1/public/pricing-data', () => {
    it('returns the dataset with ETag and Cache-Control', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/pricing-data')
        .expect(200);

      expect(response.headers.etag).toBe(`"${data.version}"`);
      expect(response.headers['cache-control']).toBe(CACHE_CONTROL_HEADER);
      expect(data.version).toMatch(/^[0-9a-f]{16}$/);
      expect(data.exchangeRate?.rate).toBe(RATE);
    });

    it('answers 304 when If-None-Match carries the current version', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/pricing-data')
        .set('If-None-Match', `"${data.version}"`)
        .expect(304);

      expect(response.text).toBe('');
    });

    it('answers 200 when If-None-Match carries another version', async () => {
      await request(testApp.http)
        .get('/api/v1/public/pricing-data')
        .set('If-None-Match', `"${FOREIGN_VERSION}"`)
        .expect(200);
    });
  });

  describe('POST /api/v1/public/estimates', () => {
    it('matches the package result for generated configurations', async () => {
      for (const configuration of samples) {
        const response = await request(bulkApp.http)
          .post('/api/v1/public/estimates')
          .send({ configuration, clientPricingVersion: data.version })
          .expect(200);

        expect(response.body.stale).toBe(false);
        expect(response.body.pricingVersion).toBe(data.version);
        expect(response.body.estimate).toEqual(
          roundTrip(estimate(configuration, data)),
        );
      }
    });

    it('flags a foreign client version as stale and returns the current one', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({
          configuration: samples[0],
          clientPricingVersion: FOREIGN_VERSION,
        })
        .expect(200);

      expect(response.body.stale).toBe(true);
      expect(response.body.pricingVersion).toBe(data.version);
      expect(response.body.estimate).toEqual(
        roundTrip(estimate(samples[0], data)),
      );
    });

    it('is not stale without a client version', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration: samples[0] })
        .expect(200);

      expect(response.body.stale).toBe(false);
    });

    it('rejects a malformed body with VALIDATION_FAILED', async () => {
      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration: { finishLevel: 'ROUGH' } })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('rejects values outside the limits with violations', async () => {
      const configuration: Configuration = {
        ...samples[0],
        totalAreaSqm: data.limits.totalAreaSqm.max + OUT_OF_BOUNDS_AREA_OFFSET,
        rooms: samples[0].rooms.map((room, index) =>
          index === 0 ? { ...room, heightM: OUT_OF_BOUNDS_HEIGHT_M } : room,
        ),
      };

      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration })
        .expect(422);

      expect(response.body.error.code).toBe(ERROR_CODES.INPUT_OUT_OF_BOUNDS);
      expect(response.body.error.params.violations).toEqual(
        expect.arrayContaining([
          {
            field: 'totalAreaSqm',
            min: data.limits.totalAreaSqm.min,
            max: data.limits.totalAreaSqm.max,
          },
          {
            field: 'rooms[0].heightM',
            min: data.limits.roomHeightM.min,
            max: data.limits.roomHeightM.max,
          },
        ]),
      );
    });

    it('rejects unknown ids with UNKNOWN_REFERENCE', async () => {
      const unknownCategoryId = randomUUID();
      const unknownOptionId = randomUUID();
      const [room, ...otherRooms] = samples[0].rooms;
      const configuration: Configuration = {
        ...samples[0],
        rooms: [
          {
            ...room,
            selections: [
              ...room.selections,
              { categoryId: unknownCategoryId, productId: null },
            ],
          },
          ...otherRooms,
        ],
        options: [
          ...samples[0].options,
          { optionId: unknownOptionId, roomClientIds: ['room-unknown'] },
        ],
      };

      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration })
        .expect(422);

      expect(response.body.error.code).toBe(ERROR_CODES.UNKNOWN_REFERENCE);
      expect(response.body.error.params.references).toEqual(
        expect.arrayContaining([
          {
            field: `rooms[0].selections[${room.selections.length}].categoryId`,
            id: unknownCategoryId,
          },
          {
            field: `options[${samples[0].options.length}].optionId`,
            id: unknownOptionId,
          },
          {
            field: `options[${samples[0].options.length}].roomClientIds[0]`,
            id: 'room-unknown',
          },
        ]),
      );
    });

    it('rejects a product from another category with UNKNOWN_REFERENCE', async () => {
      const [room, ...otherRooms] = samples[0].rooms;
      const foreign = data.products.find(
        (product) => product.categoryId !== data.categories[0].id,
      );
      if (foreign === undefined) {
        throw new Error('Seed has no product outside the first category');
      }
      const configuration: Configuration = {
        ...samples[0],
        rooms: [
          {
            ...room,
            selections: [
              { categoryId: data.categories[0].id, productId: foreign.id },
            ],
          },
          ...otherRooms,
        ],
      };

      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration })
        .expect(422);

      expect(response.body.error.code).toBe(ERROR_CODES.UNKNOWN_REFERENCE);
      expect(response.body.error.params.references).toEqual([
        { field: 'rooms[0].selections[0].productId', id: foreign.id },
      ]);
    });

    it('rejects duplicate room ids with VALIDATION_FAILED', async () => {
      const [room, ...otherRooms] = samples[0].rooms;
      const configuration: Configuration = {
        ...samples[0],
        rooms: [room, { ...room }, ...otherRooms],
      };

      const response = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it.each(['USD', 'UAH'] as const)(
      'converts every line to kopecks at the active rate for %s',
      async (currency) => {
        const configuration: Configuration = { ...samples[0], currency };

        const response = await request(testApp.http)
          .post('/api/v1/public/estimates')
          .send({ configuration })
          .expect(200);
        const result = response.body.estimate;

        expect(result.currency).toBe(currency);
        expect(result.exchangeRate.rate).toBe(RATE);
        expect(result.lines.length).toBeGreaterThan(0);

        for (const line of result.lines) {
          expect(line.amountUahKopecks).toBe(
            convertCentsToKopecks(line.amountCents, RATE),
          );
        }

        const kopecksSum = result.lines.reduce(
          (sum: number, line: { amountUahKopecks: number }) =>
            sum + line.amountUahKopecks,
          0,
        );
        expect(result.totals.uahKopecks).toBe(kopecksSum);
        expect(result.totals).toEqual(
          roundTrip(estimate(configuration, data)).totals,
        );
      },
    );
  });
});
