import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { PublicationStatus } from '../../src/generated/prisma/enums';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { CatalogCache } from '../../src/modules/catalog/public/catalog-cache';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';
import {
  buildNamedBedroomsConfiguration,
  buildProjectsConfiguration,
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const CALCULATIONS = '/api/v1/public/calculations';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const VALIDITY_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const TIME_TOLERANCE_MS = 1000;
const STALE_PRICING_VERSION = '0000000000000000';
const PRICE_OFFSET_CENTS = 500;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const UNKNOWN_PUBLIC_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const UNKNOWN_VERSION_NUMBER = 99;
const MODIFIED_PRICE_CENTS = 123_456;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

interface LineView {
  id: string;
  productId: string | null;
  roomName: string | null;
  categoryName: string | null;
  product: { name: string; brand: string } | null;
}

describe('calculations e2e', () => {
  let testApp: TestApp;
  let currentPricingVersion: string;
  let created: request.Response;

  function savedBody(overrides: Record<string, unknown> = {}) {
    return {
      configuration: buildProjectsConfiguration(),
      styleId: projectsStyleId,
      clientPricingVersion: currentPricingVersion,
      clientTotalUsdCents: 1,
      ...overrides,
    };
  }

  function save(
    body: object,
    key: string | null = newIdempotencyKey(),
    lang = 'uk',
  ) {
    const req = request(testApp.http).post(`${CALCULATIONS}?lang=${lang}`);

    return (key === null ? req : req.set(IDEMPOTENCY_HEADER, key)).send(body);
  }

  function latest(publicId: string, lang = 'uk') {
    return request(testApp.http).get(
      `${CALCULATIONS}/${publicId}?lang=${lang}`,
    );
  }

  function findLine(lines: LineView[], productId: string): LineView {
    const line = lines.find((item) => item.productId === productId);
    expect(line).toBeDefined();

    return line as LineView;
  }

  function invalidateCaches(): void {
    testApp.app.get(PricingDataService).invalidate();
    testApp.app.get(CatalogCache).invalidate();
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedProjectsData(testApp);

    const pricing = await request(testApp.http)
      .get('/api/v1/public/pricing-data')
      .expect(200);
    currentPricingVersion = pricing.body.version as string;

    created = await save(savedBody());
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('POST /api/v1/public/calculations', () => {
    it('saves a snapshot equal to the live estimate', async () => {
      expect(created.status).toBe(201);

      const live = await request(testApp.http)
        .post('/api/v1/public/estimates')
        .send({ configuration: buildProjectsConfiguration() })
        .expect(200);
      const estimate = live.body.estimate;
      const { version } = created.body;

      expect(version.lines).toHaveLength(estimate.lines.length);
      version.lines.forEach((line: object, index: number) => {
        expect(line).toMatchObject(estimate.lines[index]);
      });
      expect(version.totals).toEqual(estimate.totals);
      expect(version.warnings).toEqual(estimate.warnings);
      expect(version.incomplete).toBe(estimate.incomplete);
      expect(version.pricingVersion).toBe(estimate.pricingVersion);
      expect(version.exchangeRate).toEqual(estimate.exchangeRate);
    });

    it('enriches lines with localized names', () => {
      const { version } = created.body;
      const flooring = findLine(
        version.lines,
        productIds.lightLaminateFlooring,
      );

      expect(flooring.product?.name).toBe('Ламінат світлого відтінку');
      expect(flooring.product?.brand).toBe('Stinova');
      expect(flooring.categoryName).toBe('Підлогове покриття');
      expect(flooring.roomName).toBe('Вітальня');
      expect(version.style).toEqual({
        id: projectsStyleId,
        name: 'Скандинавський',
      });
    });

    it('numbers the first version and lists it in versions', () => {
      const { version } = created.body;

      expect(version.number).toBe(1);
      expect(version.publicId).toMatch(PUBLIC_ID_PATTERN);
      expect(version.versions).toHaveLength(1);
      expect(version.versions[0]).toMatchObject({
        number: 1,
        totalUsdCents: version.totals.usdCents,
        expired: false,
      });
      expect(version.configuration).toEqual(buildProjectsConfiguration());
    });

    it('sets expiresAt from the validity setting', () => {
      const { version } = created.body;
      const lifetime =
        new Date(version.expiresAt).getTime() -
        new Date(version.createdAt).getTime();

      expect(version.expired).toBe(false);
      expect(Math.abs(lifetime - VALIDITY_DAYS * MS_PER_DAY)).toBeLessThan(
        TIME_TOLERANCE_MS,
      );
    });

    it('returns no price difference for the current pricing version', () => {
      expect(created.body.priceDifference).toBeNull();
    });

    it('returns the price difference for a stale pricing version', async () => {
      const savedTotal = created.body.version.totals.usdCents as number;
      const clientTotal = savedTotal + PRICE_OFFSET_CENTS;

      const response = await save(
        savedBody({
          clientPricingVersion: STALE_PRICING_VERSION,
          clientTotalUsdCents: clientTotal,
        }),
      );

      expect(response.status).toBe(201);
      expect(response.body.priceDifference).toEqual({
        clientTotalUsdCents: clientTotal,
        savedTotalUsdCents: savedTotal,
        diffCents: -PRICE_OFFSET_CENTS,
      });
    });

    it('keeps two bedrooms with distinct names after reopening', async () => {
      const response = await save(
        savedBody({ configuration: buildNamedBedroomsConfiguration() }),
      );
      expect(response.status).toBe(201);

      const reopened = await latest(response.body.version.publicId);
      const rooms = reopened.body.rooms as {
        name: string;
        roomTypeName: string;
      }[];

      expect(rooms.map((room) => room.name)).toEqual([
        'Master bedroom',
        'Kids room',
      ]);
      expect(rooms.map((room) => room.roomTypeName)).toEqual([
        'Спальня',
        'Спальня',
      ]);
      expect(
        reopened.body.configuration.rooms.map(
          (room: { name: string }) => room.name,
        ),
      ).toEqual(['Master bedroom', 'Kids room']);
    });

    it('trims the room name', async () => {
      const configuration = buildNamedBedroomsConfiguration();
      configuration.rooms[0].name = '  Master bedroom  ';

      const response = await save(savedBody({ configuration }));

      expect(response.status).toBe(201);
      expect(response.body.version.rooms[0].name).toBe('Master bedroom');
    });

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['too long', 'a'.repeat(61)],
    ])('rejects a %s room name', async (_label, name) => {
      const configuration = buildNamedBedroomsConfiguration();
      configuration.rooms[0].name = name;

      const response = await save(savedBody({ configuration }));

      expect(response.status).toBe(400);
    });

    it('rejects an unknown style with STYLE_NOT_FOUND', async () => {
      const response = await save(savedBody({ styleId: randomUUID() }));

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.STYLE_NOT_FOUND);
    });

    it('rejects a draft style with STYLE_NOT_FOUND', async () => {
      const draft = await testApp.prisma.style.create({
        data: {
          name: { en: 'Draft', uk: 'Чернетка' },
          description: { en: 'Draft', uk: 'Чернетка' },
          sortOrder: 99,
          status: PublicationStatus.DRAFT,
        },
      });

      const response = await save(savedBody({ styleId: draft.id }));

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.STYLE_NOT_FOUND);
    });
  });

  describe('idempotency', () => {
    it('replays the first response for the same key and body', async () => {
      const key = newIdempotencyKey();
      const before = await testApp.prisma.calculation.count();

      const first = await save(savedBody(), key);
      const afterFirst = await testApp.prisma.calculation.count();
      const replay = await save(savedBody(), key);

      expect(first.status).toBe(201);
      expect(afterFirst).toBe(before + 1);
      expect(replay.status).toBe(first.status);
      expect(replay.body).toEqual(first.body);
      await expect(testApp.prisma.calculation.count()).resolves.toBe(
        afterFirst,
      );
    });

    it('answers 422 when the key is reused with another body', async () => {
      const key = newIdempotencyKey();
      await save(savedBody(), key);

      const response = await save(savedBody({ clientTotalUsdCents: 2 }), key);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    });

    it('answers 428 without the key', async () => {
      const response = await save(savedBody(), null);

      expect(response.status).toBe(428);
      expect(response.body.error.code).toBe(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      );
    });
  });

  describe('GET /api/v1/public/calculations/{publicId}', () => {
    it('returns the latest version', async () => {
      const response = await latest(created.body.version.publicId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(created.body.version);
    });

    it('returns the same body for versions/1 of a single-version calculation', async () => {
      const { publicId } = created.body.version;

      const [byNumber, byLatest] = await Promise.all([
        request(testApp.http).get(
          `${CALCULATIONS}/${publicId}/versions/1?lang=uk`,
        ),
        latest(publicId),
      ]);

      expect(byNumber.status).toBe(200);
      expect(byNumber.body).toEqual(byLatest.body);
    });

    it('localizes names by lang', async () => {
      const { publicId } = created.body.version;

      const [uk, en] = await Promise.all([
        latest(publicId, 'uk'),
        latest(publicId, 'en'),
      ]);
      const enFlooring = findLine(
        en.body.lines,
        productIds.lightLaminateFlooring,
      );
      const ukFlooring = findLine(
        uk.body.lines,
        productIds.lightLaminateFlooring,
      );

      expect(en.body.style.name).toBe('Scandinavian');
      expect(uk.body.style.name).toBe('Скандинавський');
      expect(en.body.rooms[0].name).toBe('Living room');
      expect(uk.body.rooms[0].name).toBe('Вітальня');
      expect(enFlooring.product?.name).toBe('Light laminate flooring');
      expect(ukFlooring.product?.name).toBe('Ламінат світлого відтінку');
      expect(enFlooring.categoryName).toBe('Floor covering');
      expect(enFlooring.roomName).toBe('Living room');
      expect(en.body.lines.map((line: LineView) => line.id)).toEqual(
        uk.body.lines.map((line: LineView) => line.id),
      );
    });

    it('answers identical 404 bodies for unknown publicId and unknown number', async () => {
      const { publicId } = created.body.version;

      const responses = await Promise.all([
        request(testApp.http).get(`${CALCULATIONS}/${UNKNOWN_PUBLIC_ID}`),
        request(testApp.http).get(
          `${CALCULATIONS}/${publicId}/versions/${UNKNOWN_VERSION_NUMBER}`,
        ),
        request(testApp.http).get(
          `${CALCULATIONS}/${UNKNOWN_PUBLIC_ID}/versions/1`,
        ),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe(
          ERROR_CODES.CALCULATION_NOT_FOUND,
        );
        expect(response.body).toEqual(responses[0].body);
      }
    });
  });

  describe('snapshot immutability', () => {
    it('keeps names and amounts after catalog and price changes', async () => {
      const { publicId } = created.body.version;
      const original = await latest(publicId);
      const renamedId = productIds.lightLaminateFlooring;
      const repricedId = productIds.whiteMattePorcelainFloorTile;
      const archivedId = productIds.whiteGlossyWallTile;
      const before = await testApp.prisma.product.findMany({
        where: { id: { in: [renamedId, repricedId, archivedId] } },
      });

      try {
        await testApp.prisma.product.update({
          where: { id: renamedId },
          data: { name: { en: 'Renamed', uk: 'Перейменований' } },
        });
        await testApp.prisma.product.update({
          where: { id: repricedId },
          data: { priceCents: MODIFIED_PRICE_CENTS },
        });
        await testApp.prisma.product.update({
          where: { id: archivedId },
          data: { status: PublicationStatus.ARCHIVED },
        });
        invalidateCaches();

        const live = await request(testApp.http)
          .post('/api/v1/public/estimates')
          .send({ configuration: buildProjectsConfiguration() })
          .expect(200);
        const after = await latest(publicId);

        expect(live.body.estimate.totals.usdCents).not.toBe(
          original.body.totals.usdCents,
        );
        expect(after.status).toBe(200);
        const { priceStatus: originalStatus, ...originalView } = original.body;
        const { priceStatus: afterStatus, ...afterView } = after.body;
        expect(afterView).toEqual(originalView);
        expect(originalStatus.changed).toBe(false);
        expect(afterStatus.changed).toBe(true);
        expect(findLine(after.body.lines, renamedId).product?.name).toBe(
          'Ламінат світлого відтінку',
        );
      } finally {
        for (const product of before) {
          await testApp.prisma.product.update({
            where: { id: product.id },
            data: {
              name: product.name as object,
              priceCents: product.priceCents,
              status: product.status,
            },
          });
        }
        invalidateCaches();
      }
    });

    it('rejects updates of calculation_versions rows', async () => {
      const { publicId } = created.body.version;
      const calculation = await testApp.prisma.calculation.findUniqueOrThrow({
        where: { publicId },
      });

      await expect(
        testApp.prisma.$executeRawUnsafe(
          `UPDATE calculation_versions SET total_usd_cents = total_usd_cents + 1 WHERE calculation_id = '${calculation.id}'`,
        ),
      ).rejects.toThrow();
    });
  });
});
