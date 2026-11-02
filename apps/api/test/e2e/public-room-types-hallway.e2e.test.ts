import type { Configuration, Estimate } from '@roomwise/calc-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { styles } from '../../src/modules/catalog/dataset/data/styles';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const ESTIMATES_PATH = '/api/v1/public/estimates';
const ROOM_TYPES_PATH = '/api/v1/public/room-types';
const ROOM_HEIGHT_M = 2.7;
const FLAT_TOTAL_AREA_SQM = 60;
const HALLWAY_LENGTH_M = 6;
const HALLWAY_WIDTH_M = 1.2;
const MISSING_AREA_HINT_SQM = 5;
const MISSING_SQM = 15;
const LIVING_LENGTH_M = 6;
const LIVING_WIDTH_M = 4;
const BEDROOM_LENGTH_M = 5;
const BEDROOM_WIDTH_M = 3;
const BATHROOM_LENGTH_M = 3;
const BATHROOM_WIDTH_M = 2;
const KITCHEN_LENGTH_M = 6;
const KITCHEN_WIDTH_M = 3;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type RoomConfiguration = Configuration['rooms'][number];
type RoomTypeCode = RoomConfiguration['roomTypeCode'];
type NewRoomTypeCode = 'HALLWAY' | 'STORAGE';

const newRoomTypeCodes: NewRoomTypeCode[] = ['HALLWAY', 'STORAGE'];

const expectedCategoryIds: Record<NewRoomTypeCode, string[]> = {
  HALLWAY: [
    categoryIds.floorCovering,
    categoryIds.skirtingBoards,
    categoryIds.wallPaint,
    categoryIds.wallpaper,
    categoryIds.ceilingFinish,
    categoryIds.lighting,
    categoryIds.doors,
  ],
  STORAGE: [
    categoryIds.floorCovering,
    categoryIds.skirtingBoards,
    categoryIds.wallPaint,
    categoryIds.ceilingFinish,
    categoryIds.lighting,
    categoryIds.doors,
  ],
};

const roomNames: Record<NewRoomTypeCode, Record<'en' | 'uk', string>> = {
  HALLWAY: { en: 'Hallway', uk: 'Коридор / передпокій' },
  STORAGE: { en: 'Walk-in closet / storage', uk: 'Гардеробна / комора' },
};

function room(
  clientId: string,
  roomTypeCode: RoomTypeCode,
  lengthM: number,
  widthM: number,
  selections: RoomConfiguration['selections'] = [],
): RoomConfiguration {
  return {
    clientId,
    roomTypeCode,
    lengthM,
    widthM,
    heightM: ROOM_HEIGHT_M,
    heatedFloor: false,
    selections,
  };
}

function configuration(overrides: Partial<Configuration> = {}): Configuration {
  return {
    scope: 'FULL',
    finishLevel: 'LIVED_IN',
    totalAreaSqm: FLAT_TOTAL_AREA_SQM,
    balconyAreaSqm: 0,
    balconyTiles: false,
    currency: 'USD',
    options: [],
    rooms: [],
    ...overrides,
  };
}

describe('hallway and storage room types on seed e2e', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();

    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(CatalogDatasetService).upsert(catalogDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(PricingDatasetService).upsert(pricingDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
    testApp.app.get(PricingDataService).invalidate();
  });

  afterAll(async () => {
    await testApp.close();
  });

  async function estimateOf(input: Configuration): Promise<Estimate> {
    const response = await request(testApp.http)
      .post(ESTIMATES_PATH)
      .send({ configuration: input })
      .expect(200);

    return response.body.estimate as Estimate;
  }

  describe('GET /api/v1/public/room-types', () => {
    it.each(['en', 'uk'] as const)(
      'returns hallway and storage with ordered categories in %s',
      async (lang) => {
        const response = await request(testApp.http)
          .get(ROOM_TYPES_PATH)
          .query({ lang })
          .expect(200);
        const items: Array<{
          code: string;
          name: string;
          categories: Array<{ id: string }>;
        }> = response.body.items;

        for (const code of newRoomTypeCodes) {
          const item = items.find((candidate) => candidate.code === code);

          expect(item?.name).toBe(roomNames[code][lang]);
          expect(item?.categories.map((category) => category.id)).toEqual(
            expectedCategoryIds[code],
          );
        }
      },
    );
  });

  describe('GET /api/v1/public/styles/:id/default-materials', () => {
    it.each(styles.map((style) => [style.name.en, style.id]))(
      'has hallway and storage pairs in the %s style',
      async (_name, styleId) => {
        const response = await request(testApp.http)
          .get(`/api/v1/public/styles/${styleId}/default-materials`)
          .expect(200);
        const items: Array<{ roomTypeCode: string; categoryId: string }> =
          response.body.items;

        for (const code of newRoomTypeCodes) {
          const pairCategoryIds = items
            .filter((item) => item.roomTypeCode === code)
            .map((item) => item.categoryId);

          expect(pairCategoryIds.length).toBeGreaterThan(0);
          expect(expectedCategoryIds[code]).toEqual(
            expect.arrayContaining(pairCategoryIds),
          );
        }
      },
    );
  });

  describe('estimates', () => {
    it('prices the materials selected in a hallway', async () => {
      const estimate = await estimateOf(
        configuration({
          scope: 'PARTIAL',
          totalAreaSqm: null,
          rooms: [
            room('hallway', 'HALLWAY', HALLWAY_LENGTH_M, HALLWAY_WIDTH_M, [
              {
                categoryId: categoryIds.floorCovering,
                productId: productIds.whiteOakParquetPlank,
              },
              {
                categoryId: categoryIds.doors,
                productId: productIds.whitePaintedInteriorDoor,
              },
            ]),
          ],
        }),
      );
      const lines = estimate.lines.filter(
        (line) =>
          line.section === 'MATERIALS' && line.roomClientId === 'hallway',
      );

      expect(lines.map((line) => line.categoryId).sort()).toEqual(
        [categoryIds.floorCovering, categoryIds.doors].sort(),
      );
      for (const line of lines) {
        expect(line.status).toBe('OK');
        expect(line.amountCents).toBeGreaterThan(0);
      }
    });

    it('warns when the rooms fall short of the total area by more than the threshold', async () => {
      const estimate = await estimateOf(
        configuration({
          rooms: [
            room('living', 'LIVING_ROOM', LIVING_LENGTH_M, LIVING_WIDTH_M),
            room('bedroom', 'BEDROOM', BEDROOM_LENGTH_M, BEDROOM_WIDTH_M),
            room('bathroom', 'BATHROOM', BATHROOM_LENGTH_M, BATHROOM_WIDTH_M),
          ],
        }),
      );

      expect(estimate.warnings).toContainEqual({
        code: 'ROOMS_AREA_BELOW_TOTAL',
        params: { missingSqm: MISSING_SQM },
      });
    });

    it('does not warn when the shortfall is within the threshold', async () => {
      const estimate = await estimateOf(
        configuration({
          rooms: [
            room('living', 'LIVING_ROOM', LIVING_LENGTH_M, LIVING_WIDTH_M),
            room('bedroom', 'BEDROOM', BEDROOM_LENGTH_M, BEDROOM_WIDTH_M),
            room('kitchen', 'KITCHEN', KITCHEN_LENGTH_M, KITCHEN_WIDTH_M),
          ],
        }),
      );

      expect(
        estimate.warnings.some(
          (warning) => warning.code === 'ROOMS_AREA_BELOW_TOTAL',
        ),
      ).toBe(false);
    });
  });

  describe('GET /api/v1/public/pricing-data', () => {
    it('exposes the missing area hint limit', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/pricing-data')
        .expect(200);

      expect(response.body.limits.missingAreaHintSqm).toBe(
        MISSING_AREA_HINT_SQM,
      );
    });
  });
});
