import type {
  Configuration,
  Estimate,
  EstimateLine,
  LineComponent,
} from '@roomwise/calc-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const ESTIMATES_PATH = '/api/v1/public/estimates';
const CENTS_PER_DOLLAR = 100;
const ROOM_HEIGHT_M = 2.7;
const KITCHEN_LENGTH_M = 4;
const KITCHEN_WIDTH_M = 3;
const PAINT_SHARE = 40;
const TILE_SHARE = 60;
const EXCEEDING_PAINT_SHARE = 70;
const FULL_SHARE = 100;
const PERCENT = 100;
const ROUNDING_TOLERANCE_CENTS = 1;
const ROUNDING_TOLERANCE_QUANTITY = 0.01;
const SQM_PRECISION_DIGITS = 3;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type Selection = Configuration['rooms'][number]['selections'][number];

const wallArea = 2 * (KITCHEN_LENGTH_M + KITCHEN_WIDTH_M) * ROOM_HEIGHT_M;

function coefficientCents(key: string): number {
  const coefficient = pricingDataset.coefficients.find(
    (item) => item.key === key,
  );

  if (!coefficient) {
    throw new Error(`Coefficient ${key} not found`);
  }

  return Math.round(coefficient.value * CENTS_PER_DOLLAR);
}

function kitchen(selections: Selection[]): Configuration {
  return {
    scope: 'PARTIAL',
    finishLevel: 'ROUGH',
    totalAreaSqm: null,
    balconyAreaSqm: 0,
    balconyTiles: false,
    currency: 'USD',
    options: [],
    rooms: [
      {
        clientId: 'kitchen',
        roomTypeCode: 'KITCHEN',
        lengthM: KITCHEN_LENGTH_M,
        widthM: KITCHEN_WIDTH_M,
        heightM: ROOM_HEIGHT_M,
        heatedFloor: false,
        selections,
      },
    ],
  };
}

function paint(areaShare?: number): Selection {
  return {
    categoryId: categoryIds.wallPaint,
    productId: productIds.whiteMatteWallPaint,
    ...(areaShare === undefined ? {} : { areaShare }),
  };
}

function tile(areaShare?: number): Selection {
  return {
    categoryId: categoryIds.wallTile,
    productId: productIds.whiteGlossyWallTile,
    ...(areaShare === undefined ? {} : { areaShare }),
  };
}

function lineOf(estimate: Estimate, categoryId: string): EstimateLine {
  const line = estimate.lines.find(
    (candidate) => candidate.categoryId === categoryId,
  );

  if (!line) {
    throw new Error(`No estimate line for ${categoryId}`);
  }

  return line;
}

function componentOf(
  line: EstimateLine,
  kind: LineComponent['kind'],
): LineComponent {
  const component = line.components?.find((item) => item.kind === kind);

  if (!component) {
    throw new Error(`No ${kind} component in ${line.id}`);
  }

  return component;
}

function prepOf(estimate: Estimate): number {
  return [categoryIds.wallPaint, categoryIds.wallTile].reduce(
    (sum, categoryId) => {
      const line = estimate.lines.find(
        (candidate) => candidate.categoryId === categoryId,
      );

      return line ? sum + componentOf(line, 'PREP').amountCents : sum;
    },
    0,
  );
}

function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    ROUNDING_TOLERANCE_CENTS,
  );
}

describe('public estimates area share e2e', () => {
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

  async function estimateOf(configuration: Configuration): Promise<Estimate> {
    const response = await request(testApp.http)
      .post(ESTIMATES_PATH)
      .send({ configuration })
      .expect(200);

    return response.body.estimate as Estimate;
  }

  it('scales material and labor by the share and puts putty on the share needing it', async () => {
    const full = await estimateOf(kitchen([paint()]));
    const shared = await estimateOf(
      kitchen([paint(PAINT_SHARE), tile(TILE_SHARE)]),
    );
    const fullPaint = lineOf(full, categoryIds.wallPaint);
    const sharedPaint = lineOf(shared, categoryIds.wallPaint);
    const plasterCents =
      coefficientCents('prep_wall_plaster') +
      coefficientCents('mat_wall_plaster');
    const puttyCents =
      coefficientCents('prep_wall_putty') + coefficientCents('mat_putty');
    const share = PAINT_SHARE / PERCENT;

    expect(sharedPaint.status).toBe('OK');
    expect(
      Math.abs((sharedPaint.quantity ?? 0) - (fullPaint.quantity ?? 0) * share),
    ).toBeLessThanOrEqual(ROUNDING_TOLERANCE_QUANTITY);
    expectNear(
      componentOf(sharedPaint, 'LABOR').amountCents,
      Math.round(wallArea * share * coefficientCents('labor_wall_paint')),
    );
    expectNear(
      prepOf(shared),
      Math.round(wallArea * plasterCents + wallArea * share * puttyCents),
    );
    expect(shared.warnings).toEqual([]);
  });

  it('keeps full plaster and no putty when the whole wall is tiled', async () => {
    const estimate = await estimateOf(kitchen([tile(FULL_SHARE)]));
    const plasterCents =
      coefficientCents('prep_wall_plaster') +
      coefficientCents('mat_wall_plaster');

    expectNear(prepOf(estimate), Math.round(wallArea * plasterCents));
  });

  it('prices a selection with a full share like one without a share', async () => {
    const without = await estimateOf(kitchen([paint()]));
    const withFullShare = await estimateOf(kitchen([paint(FULL_SHARE)]));

    expect(withFullShare.totals).toEqual(without.totals);
    expect(withFullShare.lines).toEqual(without.lines);
  });

  it('returns an error line when the shares exceed the surface', async () => {
    const estimate = await estimateOf(
      kitchen([paint(EXCEEDING_PAINT_SHARE), tile(TILE_SHARE)]),
    );
    const line = lineOf(estimate, categoryIds.wallPaint);

    expect(line.status).toBe('ERROR');
    expect(line.error).toMatchObject({
      code: 'AREA_SHARE_EXCEEDS_SURFACE',
      params: {
        roomClientId: 'kitchen',
        surface: 'WALLS',
        percent: EXCEEDING_PAINT_SHARE + TILE_SHARE,
      },
    });
    expect(estimate.incomplete).toBe(true);
  });

  it('returns an error line when only some selections of a surface have a share', async () => {
    const estimate = await estimateOf(kitchen([paint(PAINT_SHARE), tile()]));

    expect(lineOf(estimate, categoryIds.wallTile).error?.code).toBe(
      'AREA_SHARE_MISSING',
    );
  });

  it('returns an error line for a share on a surface that does not allow it', async () => {
    const estimate = await estimateOf(
      kitchen([
        {
          categoryId: categoryIds.ceilingFinish,
          productId: productIds.whiteMatteCeilingPaint,
          areaShare: PAINT_SHARE,
        },
      ]),
    );

    expect(lineOf(estimate, categoryIds.ceilingFinish).error?.code).toBe(
      'AREA_SHARE_NOT_ALLOWED',
    );
  });

  it('warns about the unallocated part when the shares sum to less than the surface', async () => {
    const estimate = await estimateOf(
      kitchen([paint(PAINT_SHARE), tile(PAINT_SHARE)]),
    );
    const unallocatedPercent = PERCENT - 2 * PAINT_SHARE;
    const warning = estimate.warnings.find(
      (item) => item.code === 'AREA_SHARE_UNALLOCATED',
    );

    expect(warning?.params).toMatchObject({
      roomClientId: 'kitchen',
      surface: 'WALLS',
      percent: unallocatedPercent,
    });
    expect(warning?.params?.sqm).toBeCloseTo(
      (wallArea * unallocatedPercent) / PERCENT,
      SQM_PRECISION_DIGITS,
    );
  });

  it.each([0, 101, 12.5])('rejects the share %s', async (areaShare) => {
    await request(testApp.http)
      .post(ESTIMATES_PATH)
      .send({ configuration: kitchen([paint(areaShare)]) })
      .expect(400);
  });
});
