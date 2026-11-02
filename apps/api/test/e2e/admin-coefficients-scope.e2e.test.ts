import type {
  Configuration,
  Estimate,
  EstimateLine,
} from '@roomwise/calc-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { ruleIds } from '../../src/modules/pricing/dataset/data/rules';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';
import {
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const ESTIMATES_PATH = '/api/v1/public/estimates';
const CALCULATIONS_PATH = '/api/v1/public/calculations';
const PRICING_DATA_PATH = '/api/v1/public/pricing-data';
const COEFFICIENTS_PATH = '/api/v1/admin/pricing/coefficients';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const CENTS_PER_DOLLAR = 100;
const ROOM_HEIGHT_M = 2.7;
const FLAT_TOTAL_AREA_SQM = 60;
const FLAT_WALL_AREA_SQM = 180.9;
const BEDROOM_LENGTH_M = 4;
const BEDROOM_WIDTH_M = 3.5;
const BEDROOM_FLOOR_AREA_SQM = BEDROOM_LENGTH_M * BEDROOM_WIDTH_M;
const PATCHED_LAMINATE_LABOR = 11.5;
const PATCHED_WALL_PLASTER = 12;
const LAMINATE_KEY = 'labor_laminate';
const PLASTER_KEY = 'prep_wall_plaster';
const BEDROOM_ID = 'bedroom';
const LAMINATE_LINE_ID = `MATERIALS:${BEDROOM_ID}:${categoryIds.floorCovering}`;
const PLASTER_LINE_ID = `BASE:${ruleIds.baseWallPlaster}`;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type RoomConfiguration = Configuration['rooms'][number];
type RoomSpec = [RoomConfiguration['roomTypeCode'], number, number];

const flatSpecs: RoomSpec[] = [
  ['LIVING_ROOM', 6, 4],
  ['BEDROOM', 4, 3.5],
  ['KITCHEN', 4, 3],
  ['BATHROOM', 3, 2],
  ['BEDROOM', 2, 2],
];

function room(
  clientId: string,
  [roomTypeCode, lengthM, widthM]: RoomSpec,
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

function configuration(
  overrides: Partial<Configuration> & Pick<Configuration, 'rooms'>,
): Configuration {
  return {
    scope: 'PARTIAL',
    finishLevel: 'ROUGH',
    totalAreaSqm: null,
    balconyAreaSqm: 0,
    balconyTiles: false,
    currency: 'USD',
    options: [],
    ...overrides,
  };
}

const partialConfiguration = configuration({
  rooms: [
    room(
      BEDROOM_ID,
      ['BEDROOM', BEDROOM_LENGTH_M, BEDROOM_WIDTH_M],
      [
        {
          categoryId: categoryIds.floorCovering,
          productId: productIds.lightLaminateFlooring,
        },
      ],
    ),
  ],
});

const fullConfiguration = configuration({
  scope: 'FULL',
  totalAreaSqm: FLAT_TOTAL_AREA_SQM,
  rooms: flatSpecs.map((spec, index) => room(`room-${index}`, spec)),
});

function seedValue(key: string): number {
  const coefficient = pricingDataset.coefficients.find(
    (item) => item.key === key,
  );

  if (!coefficient) {
    throw new Error(`Coefficient ${key} not found`);
  }

  return coefficient.value;
}

function cents(value: number): number {
  return Math.round(value * CENTS_PER_DOLLAR);
}

function lineOf(estimate: Estimate, id: string): EstimateLine {
  const line = estimate.lines.find((candidate) => candidate.id === id);

  if (!line) {
    throw new Error(`No estimate line ${id}`);
  }

  return line;
}

function laborCents(line: EstimateLine): number | undefined {
  return line.components?.find((component) => component.kind === 'LABOR')
    ?.amountCents;
}

describe('admin coefficients scope e2e', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedProjectsData(testApp);

    const admin = await createAdmin(testApp.prisma);
    cookie = await login(testApp.http, admin.login, admin.password);
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

  async function pricingVersion(): Promise<string> {
    const response = await request(testApp.http)
      .get(PRICING_DATA_PATH)
      .expect(200);

    return response.body.version as string;
  }

  async function save(input: Configuration) {
    const clientPricingVersion = await pricingVersion();
    const response = await request(testApp.http)
      .post(CALCULATIONS_PATH)
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        configuration: input,
        styleId: projectsStyleId,
        clientPricingVersion,
        clientTotalUsdCents: 1,
      })
      .expect(201);

    return response.body.version as { publicId: string };
  }

  function latest(publicId: string) {
    return request(testApp.http).get(`${CALCULATIONS_PATH}/${publicId}`);
  }

  async function currentCoefficient(key: string) {
    const response = await request(testApp.http)
      .get(COEFFICIENTS_PATH)
      .set('Cookie', cookie)
      .expect(200);
    const item = (
      response.body.items as Array<{
        id: string;
        key: string;
        revision: string;
      }>
    ).find((candidate) => candidate.key === key);

    if (!item) {
      throw new Error(`No coefficient ${key}`);
    }

    return item;
  }

  async function patchCoefficient(key: string, value: number) {
    const { id, revision } = await currentCoefficient(key);

    await request(testApp.http)
      .patch(`${COEFFICIENTS_PATH}/${id}`)
      .set('Cookie', cookie)
      .send({ value, revision })
      .expect(200);
    testApp.app.get(PricingDataService).invalidate();
  }

  it('applies new rates to fresh estimates and keeps saved snapshots', async () => {
    const savedPartial = await save(partialConfiguration);
    const savedFull = await save(fullConfiguration);
    const versionBefore = await pricingVersion();
    const partialBefore = await estimateOf(partialConfiguration);
    const fullBefore = await estimateOf(fullConfiguration);
    const savedPartialBefore = (await latest(savedPartial.publicId)).body;
    const savedFullBefore = (await latest(savedFull.publicId)).body;

    try {
      await patchCoefficient(LAMINATE_KEY, PATCHED_LAMINATE_LABOR);
      await patchCoefficient(PLASTER_KEY, PATCHED_WALL_PLASTER);

      const partialAfter = await estimateOf(partialConfiguration);
      const fullAfter = await estimateOf(fullConfiguration);
      const savedPartialAfter = (await latest(savedPartial.publicId)).body;
      const savedFullAfter = (await latest(savedFull.publicId)).body;
      const plasterUnitDeltaCents =
        cents(PATCHED_WALL_PLASTER) - cents(seedValue(PLASTER_KEY));

      expect(await pricingVersion()).not.toBe(versionBefore);

      expect(laborCents(lineOf(partialBefore, LAMINATE_LINE_ID))).toBe(
        Math.round(BEDROOM_FLOOR_AREA_SQM * cents(seedValue(LAMINATE_KEY))),
      );
      expect(laborCents(lineOf(partialAfter, LAMINATE_LINE_ID))).toBe(
        Math.round(BEDROOM_FLOOR_AREA_SQM * cents(PATCHED_LAMINATE_LABOR)),
      );

      expect(lineOf(fullAfter, PLASTER_LINE_ID).amountCents).toBe(
        lineOf(fullBefore, PLASTER_LINE_ID).amountCents +
          Math.round(FLAT_WALL_AREA_SQM * plasterUnitDeltaCents),
      );

      expect(savedPartialAfter.totals).toEqual(savedPartialBefore.totals);
      expect(savedPartialAfter.lines).toEqual(savedPartialBefore.lines);
      expect(savedPartialAfter.priceStatus.changed).toBe(true);
      expect(savedPartialAfter.priceStatus.snapshotTotalUsdCents).toBe(
        savedPartialBefore.totals.usdCents,
      );
      expect(savedPartialAfter.priceStatus.currentTotalUsdCents).toBe(
        partialAfter.totals.usdCents,
      );

      expect(savedFullAfter.totals).toEqual(savedFullBefore.totals);
      expect(savedFullAfter.lines).toEqual(savedFullBefore.lines);
      expect(savedFullAfter.priceStatus.changed).toBe(true);
      expect(savedFullAfter.priceStatus.snapshotTotalUsdCents).toBe(
        savedFullBefore.totals.usdCents,
      );
      expect(savedFullAfter.priceStatus.currentTotalUsdCents).toBe(
        fullAfter.totals.usdCents,
      );
    } finally {
      await patchCoefficient(LAMINATE_KEY, seedValue(LAMINATE_KEY));
      await patchCoefficient(PLASTER_KEY, seedValue(PLASTER_KEY));
    }

    expect(await pricingVersion()).toBe(versionBefore);
    expect((await latest(savedPartial.publicId)).body.priceStatus.changed).toBe(
      false,
    );
  });
});
