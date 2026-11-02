import type { Configuration, Estimate } from '@roomwise/calc-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { roomTypes } from '../../src/modules/catalog/dataset/data/room-types';
import {
  styleIds,
  styles,
} from '../../src/modules/catalog/dataset/data/styles';
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
const WITHIN_THRESHOLD_MARGIN_SQM = 1;
const ABOVE_THRESHOLD_MARGIN_SQM = 1;
const LIVING_LENGTH_M = 6;
const LIVING_WIDTH_M = 4;
const BEDROOM_LENGTH_M = 5;
const BEDROOM_WIDTH_M = 3;
const KITCHEN_LENGTH_M = 6;
const KITCHEN_WIDTH_M = 3;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type RoomConfiguration = Configuration['rooms'][number];
type RoomTypeCode = RoomConfiguration['roomTypeCode'];
type NewRoomTypeCode = 'HALLWAY' | 'STORAGE';

const newRoomTypeCodes: NewRoomTypeCode[] = ['HALLWAY', 'STORAGE'];

const expectedRoomTypes = Object.fromEntries(
  newRoomTypeCodes.map((code) => {
    const roomType = roomTypes.find((candidate) => candidate.code === code);

    if (!roomType) {
      throw new Error(`Room type ${code} is not seeded`);
    }

    return [code, roomType];
  }),
) as Record<NewRoomTypeCode, (typeof roomTypes)[number]>;

const expectedCategoryIds = Object.fromEntries(
  newRoomTypeCodes.map((code) => [code, expectedRoomTypes[code].categoryIds]),
) as Record<NewRoomTypeCode, string[]>;

const roomNames = Object.fromEntries(
  newRoomTypeCodes.map((code) => [code, expectedRoomTypes[code].name]),
) as Record<NewRoomTypeCode, Record<'en' | 'uk', string>>;

const missingAreaHintSqm = pricingDataset.limits.missingAreaHintSqm;

const fixedRooms = [
  room('living', 'LIVING_ROOM', LIVING_LENGTH_M, LIVING_WIDTH_M),
  room('bedroom', 'BEDROOM', BEDROOM_LENGTH_M, BEDROOM_WIDTH_M),
  room('kitchen', 'KITCHEN', KITCHEN_LENGTH_M, KITCHEN_WIDTH_M),
];
const fixedRoomsAreaSqm = fixedRooms.reduce(
  (sum, fixedRoom) => sum + fixedRoom.lengthM * fixedRoom.widthM,
  0,
);

function configurationMissing(missingSqm: number): Configuration {
  return configuration({
    totalAreaSqm: fixedRoomsAreaSqm + missingSqm,
    rooms: fixedRooms,
  });
}

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

  describe('scandinavian default materials', () => {
    it('cover every category of hallway and storage', async () => {
      const response = await request(testApp.http)
        .get(`/api/v1/public/styles/${styleIds.scandinavian}/default-materials`)
        .expect(200);
      const items: Array<{ roomTypeCode: string; categoryId: string }> =
        response.body.items;

      for (const code of newRoomTypeCodes) {
        const pairCategoryIds = items
          .filter((item) => item.roomTypeCode === code)
          .map((item) => item.categoryId);

        expect([...pairCategoryIds].sort()).toEqual(
          [...expectedCategoryIds[code]].sort(),
        );
      }
    });
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
      const missingSqm = missingAreaHintSqm + ABOVE_THRESHOLD_MARGIN_SQM;
      const estimate = await estimateOf(configurationMissing(missingSqm));

      expect(estimate.warnings).toContainEqual({
        code: 'ROOMS_AREA_BELOW_TOTAL',
        params: { missingSqm },
      });
    });

    it.each([
      ['below the threshold', missingAreaHintSqm - WITHIN_THRESHOLD_MARGIN_SQM],
      ['exactly at the threshold', missingAreaHintSqm],
    ])('does not warn when the shortfall is %s', async (_name, missingSqm) => {
      const estimate = await estimateOf(configurationMissing(missingSqm));

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

      expect(response.body.limits.missingAreaHintSqm).toBe(missingAreaHintSqm);
    });
  });
});
