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
import { optionIds } from '../../src/modules/catalog/dataset/data/options';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { ruleIds } from '../../src/modules/pricing/dataset/data/rules';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const ESTIMATES_PATH = '/api/v1/public/estimates';
const FULL_TOTAL_AREA_SQM = 60;
const CENTS_PER_DOLLAR = 100;
const QUANTITY_PRECISION = 1000;
const ROOM_HEIGHT_M = 2.7;
const BEDROOM_LENGTH_M = 4;
const BEDROOM_WIDTH_M = 3;
const KITCHEN_LENGTH_M = 4;
const KITCHEN_WIDTH_M = 3;
const BATHROOM_LENGTH_M = 3;
const BATHROOM_WIDTH_M = 2;
const BALCONY_AREA_SQM = 5;
const LAMINATE_LABOR_CENTS = 8400;
const LIVED_IN_FLOOR_PREP_CENTS = 7560;
const ROUGH_FLOOR_PREP_CENTS = 27_720;
const WALL_PREP_PER_SQM_CENTS = 2260;
const KITCHEN_WALL_PREP_CENTS = 85_428;
const ELECTRICS_CENTS = 36_360;
const PIPES_CENTS = 16_900;
const BALCONY_LABOR_CENTS = 9300;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type FinishLevel = Configuration['finishLevel'];
type RoomConfiguration = Configuration['rooms'][number];
type Selections = RoomConfiguration['selections'];

function coefficientCents(key: string): number {
  const coefficient = pricingDataset.coefficients.find(
    (item) => item.key === key,
  );

  if (!coefficient) {
    throw new Error(`Coefficient ${key} not found`);
  }

  return Math.round(coefficient.value * CENTS_PER_DOLLAR);
}

function productOf(productId: string) {
  const product = catalogDataset.products.find((item) => item.id === productId);

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  return product;
}

function wasteOf(productId: string): number {
  const product = productOf(productId);
  const category = catalogDataset.categories.find(
    (item) => item.id === product.categoryId,
  );

  return (product.wastePercentOverride ?? category?.wastePercent ?? 0) / 100;
}

function room(
  clientId: string,
  roomTypeCode: RoomConfiguration['roomTypeCode'],
  lengthM: number,
  widthM: number,
  selections: Selections = [],
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

function bedroom(selections: Selections = []): RoomConfiguration {
  return room(
    'bedroom',
    'BEDROOM',
    BEDROOM_LENGTH_M,
    BEDROOM_WIDTH_M,
    selections,
  );
}

function kitchen(selections: Selections = []): RoomConfiguration {
  return room(
    'kitchen',
    'KITCHEN',
    KITCHEN_LENGTH_M,
    KITCHEN_WIDTH_M,
    selections,
  );
}

function partial(overrides: Partial<Configuration> = {}): Configuration {
  return {
    scope: 'PARTIAL',
    finishLevel: 'LIVED_IN',
    totalAreaSqm: null,
    balconyAreaSqm: 0,
    balconyTiles: false,
    currency: 'USD',
    options: [],
    rooms: [],
    ...overrides,
  };
}

function full(overrides: Partial<Configuration> = {}): Configuration {
  return partial({
    scope: 'FULL',
    totalAreaSqm: FULL_TOTAL_AREA_SQM,
    ...overrides,
  });
}

function lineOf(estimate: Estimate, id: string): EstimateLine {
  const line = estimate.lines.find((candidate) => candidate.id === id);

  if (!line) {
    throw new Error(`No estimate line ${id}`);
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

function materialLineId(roomClientId: string, categoryId: string): string {
  return `MATERIALS:${roomClientId}:${categoryId}`;
}

function sumCents(lines: EstimateLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}

describe('public estimates of partial renovation on seed e2e', () => {
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

  describe('floor covering', () => {
    const floorArea = BEDROOM_LENGTH_M * BEDROOM_WIDTH_M;
    const laminateId = productIds.lightLaminateFlooring;
    const laminateLineId = materialLineId('bedroom', categoryIds.floorCovering);
    const laminateSelection = [
      { categoryId: categoryIds.floorCovering, productId: laminateId },
    ];
    const laminateQuantity = floorArea * (1 + wasteOf(laminateId));
    const laminateMaterialCents = Math.round(
      laminateQuantity *
        (productOf(laminateId).priceCents +
          coefficientCents('laminate_underlay')),
    );
    const laminateLaborCents = Math.round(
      floorArea * coefficientCents('labor_laminate'),
    );
    const screedCents = Math.round(
      floorArea *
        (coefficientCents('prep_screed') + coefficientCents('mat_screed')),
    );
    const demolitionCents = Math.round(
      floorArea *
        (coefficientCents('prep_floor_demolition') +
          coefficientCents('mat_demolition_disposal')),
    );

    async function laminateLine(finishLevel: FinishLevel) {
      const estimate = await estimateOf(
        partial({ finishLevel, rooms: [bedroom(laminateSelection)] }),
      );

      return { estimate, line: lineOf(estimate, laminateLineId) };
    }

    it('prices laminate in a lived-in bedroom as material, labour and demolition', async () => {
      const { estimate, line } = await laminateLine('LIVED_IN');

      expect(laminateLaborCents).toBe(LAMINATE_LABOR_CENTS);
      expect(demolitionCents).toBe(LIVED_IN_FLOOR_PREP_CENTS);
      expect(line.status).toBe('OK');
      expect(line.warnings).toEqual([]);
      expect(line.quantity).toBe(
        Math.round(laminateQuantity * QUANTITY_PRECISION) / QUANTITY_PRECISION,
      );
      expect(line.components?.map((component) => component.kind)).toEqual([
        'MATERIAL',
        'LABOR',
        'PREP',
      ]);
      expect(componentOf(line, 'MATERIAL').amountCents).toBe(
        laminateMaterialCents,
      );
      expect(componentOf(line, 'LABOR').amountCents).toBe(laminateLaborCents);
      expect(componentOf(line, 'PREP').amountCents).toBe(demolitionCents);
      expect(line.amountCents).toBe(
        laminateMaterialCents + laminateLaborCents + demolitionCents,
      );
      expect(estimate.lines.filter((item) => item.section === 'BASE')).toEqual(
        [],
      );
      expect(estimate.totals.sections.BASE.usdCents).toBe(0);
      expect(estimate.totals.sections.MATERIALS.usdCents).toBe(
        line.amountCents,
      );
    });

    it('adds screed to the floor line of a rough bedroom', async () => {
      const { line } = await laminateLine('ROUGH');

      expect(screedCents).toBe(ROUGH_FLOOR_PREP_CENTS);
      expect(componentOf(line, 'PREP').amountCents).toBe(screedCents);
      expect(line.amountCents).toBe(
        laminateMaterialCents + laminateLaborCents + screedCents,
      );
    });

    it('keeps a zero preparation component in a pre-finish bedroom', async () => {
      const rough = await laminateLine('ROUGH');
      const preFinish = await laminateLine('PRE_FINISH');

      expect(preFinish.line.components).toHaveLength(3);
      expect(componentOf(preFinish.line, 'PREP').amountCents).toBe(0);
      expect(componentOf(preFinish.line, 'MATERIAL').amountCents).toBe(
        componentOf(rough.line, 'MATERIAL').amountCents,
      );
      expect(componentOf(preFinish.line, 'LABOR').amountCents).toBe(
        componentOf(rough.line, 'LABOR').amountCents,
      );
      expect(rough.line.amountCents - preFinish.line.amountCents).toBe(
        screedCents,
      );
    });
  });

  describe('walls', () => {
    it('counts wall preparation once for paint and tile in one room', async () => {
      const estimate = await estimateOf(
        partial({
          finishLevel: 'ROUGH',
          rooms: [
            kitchen([
              {
                categoryId: categoryIds.wallPaint,
                productId: productIds.whiteMatteWallPaint,
              },
              {
                categoryId: categoryIds.wallTile,
                productId: productIds.whiteGlossyWallTile,
              },
            ]),
          ],
        }),
      );
      const paint = lineOf(
        estimate,
        materialLineId('kitchen', categoryIds.wallPaint),
      );
      const tile = lineOf(
        estimate,
        materialLineId('kitchen', categoryIds.wallTile),
      );
      const wallArea = 2 * (KITCHEN_LENGTH_M + KITCHEN_WIDTH_M) * ROOM_HEIGHT_M;
      const prepPerSqmCents =
        coefficientCents('prep_wall_plaster') +
        coefficientCents('mat_wall_plaster') +
        coefficientCents('prep_wall_putty') +
        coefficientCents('mat_putty');
      const prepCents = Math.round(wallArea * prepPerSqmCents);

      expect(prepPerSqmCents).toBe(WALL_PREP_PER_SQM_CENTS);
      expect(prepCents).toBe(KITCHEN_WALL_PREP_CENTS);
      expect(componentOf(paint, 'PREP').amountCents).toBe(prepCents);
      expect(componentOf(paint, 'PREP').sharedWithCategoryId).toBeUndefined();
      expect(componentOf(tile, 'PREP')).toMatchObject({
        amountCents: 0,
        sharedWithCategoryId: categoryIds.wallPaint,
      });
      expect(componentOf(paint, 'LABOR').amountCents).toBe(
        Math.round(wallArea * coefficientCents('labor_wall_paint')),
      );
      expect(componentOf(tile, 'LABOR').amountCents).toBe(
        Math.round(wallArea * coefficientCents('labor_wall_tile')),
      );
      expect(
        componentOf(paint, 'PREP').amountCents +
          componentOf(tile, 'PREP').amountCents,
      ).toBe(prepCents);
    });
  });

  describe('missing labour rate', () => {
    it('warns LABOR_RATE_MISSING and prices labour at zero', async () => {
      const seededLaborFormula = pricingDataset.rules.find(
        (rule) => rule.id === ruleIds.wallPaint,
      )?.laborFormula;

      if (!seededLaborFormula) {
        throw new Error('Seeded wall paint rule has no labor formula');
      }

      const configuration = partial({
        finishLevel: 'PRE_FINISH',
        rooms: [
          kitchen([
            {
              categoryId: categoryIds.wallPaint,
              productId: productIds.whiteMatteWallPaint,
            },
          ]),
        ],
      });
      const paintLineId = materialLineId('kitchen', categoryIds.wallPaint);
      const pricingData = testApp.app.get(PricingDataService);
      const before = lineOf(await estimateOf(configuration), paintLineId);

      expect(before.warnings).toEqual([]);
      expect(componentOf(before, 'LABOR').amountCents).toBeGreaterThan(0);

      await testApp.prisma.pricingRule.update({
        where: { id: ruleIds.wallPaint },
        data: { laborFormula: null },
      });
      pricingData.invalidate();

      try {
        const after = await estimateOf(configuration);
        const line = lineOf(after, paintLineId);

        expect(line.status).toBe('OK');
        expect(componentOf(line, 'LABOR').amountCents).toBe(0);
        expect(line.warnings).toContainEqual({
          code: 'LABOR_RATE_MISSING',
          params: { categoryId: categoryIds.wallPaint },
        });
        expect(after.warnings).toContainEqual(
          expect.objectContaining({
            code: 'LABOR_RATE_MISSING',
            lineId: paintLineId,
          }),
        );
        expect(line.amountCents).toBe(
          before.amountCents - componentOf(before, 'LABOR').amountCents,
        );
      } finally {
        await testApp.prisma.pricingRule.update({
          where: { id: ruleIds.wallPaint },
          data: { laborFormula: seededLaborFormula },
        });
        pricingData.invalidate();
      }
    });
  });

  describe('engineering options', () => {
    const bedroomArea = BEDROOM_LENGTH_M * BEDROOM_WIDTH_M;
    const bathroomArea = BATHROOM_LENGTH_M * BATHROOM_WIDTH_M;
    const rooms = [
      bedroom(),
      room('bathroom', 'BATHROOM', BATHROOM_LENGTH_M, BATHROOM_WIDTH_M),
    ];
    const options = [
      {
        optionId: optionIds.replaceElectrics,
        roomClientIds: ['bedroom', 'bathroom'],
      },
      {
        optionId: optionIds.replacePipes,
        roomClientIds: ['bedroom', 'bathroom'],
      },
    ];

    function optionLineOf(estimate: Estimate, optionId: string): EstimateLine {
      const line = estimate.lines.find((item) => item.optionId === optionId);

      if (!line) {
        throw new Error(`No option line ${optionId}`);
      }

      return line;
    }

    it('prices wiring per room square meter and pipes per wet room in a partial scope', async () => {
      const estimate = await estimateOf(partial({ rooms, options }));
      const electrics = optionLineOf(estimate, optionIds.replaceElectrics);
      const pipes = optionLineOf(estimate, optionIds.replacePipes);
      const electricsUnitCents =
        coefficientCents('eng_electrics_sqm') +
        coefficientCents('mat_electrics_sqm');
      const pipesUnitCents =
        coefficientCents('eng_plumbing_room') +
        coefficientCents('mat_plumbing_room');
      const engineeringLines = estimate.lines.filter(
        (item) => item.section === 'ENGINEERING',
      );

      expect(electrics.status).toBe('OK');
      expect(electrics.unit).toBe('ROOM_SQM');
      expect(electrics.quantity).toBe(bedroomArea + bathroomArea);
      expect(electrics.unitPriceCents).toBe(electricsUnitCents);
      expect(electrics.amountCents).toBe(
        Math.round((bedroomArea + bathroomArea) * electricsUnitCents),
      );
      expect(electrics.amountCents).toBe(ELECTRICS_CENTS);
      expect(pipes.status).toBe('OK');
      expect(pipes.unit).toBe('ROOM');
      expect(pipes.quantity).toBe(1);
      expect(pipes.unitPriceCents).toBe(pipesUnitCents);
      expect(pipes.amountCents).toBe(PIPES_CENTS);
      expect(pipes.warnings).toEqual([
        {
          code: 'OPTION_ROOM_TYPE_NOT_ALLOWED',
          params: { roomClientId: 'bedroom', roomTypeCode: 'BEDROOM' },
        },
      ]);
      expect(sumCents(engineeringLines)).toBe(
        estimate.totals.sections.ENGINEERING.usdCents,
      );
    });

    it('marks both options unavailable in a full scope', async () => {
      const estimate = await estimateOf(full({ rooms, options }));

      for (const optionId of [
        optionIds.replaceElectrics,
        optionIds.replacePipes,
      ]) {
        const line = optionLineOf(estimate, optionId);

        expect(line.status).toBe('UNAVAILABLE');
        expect(line.amountCents).toBe(0);
        expect(line.error).toEqual({
          code: 'OPTION_SCOPE_NOT_ALLOWED',
          params: { optionId, scope: 'FULL' },
        });
      }
    });
  });

  describe('balcony tiles', () => {
    const balcony = {
      balconyAreaSqm: BALCONY_AREA_SQM,
      balconyTiles: true,
      rooms: [bedroom()],
    };

    function balconyLineOf(estimate: Estimate): EstimateLine {
      const line = estimate.lines.find(
        (item) => item.ruleId === ruleIds.balconyTile,
      );

      if (!line) {
        throw new Error('No balcony tile line');
      }

      return line;
    }

    it('includes installation labour in both scopes', async () => {
      const partialLine = balconyLineOf(await estimateOf(partial(balcony)));
      const fullLine = balconyLineOf(await estimateOf(full(balcony)));
      const tileCents = coefficientCents('balcony_tile');
      const laborCents = coefficientCents('labor_balcony_tile');

      const expectedCents = BALCONY_AREA_SQM * (tileCents + laborCents);

      expect(fullLine.amountCents).toBe(expectedCents);
      expect(partialLine.amountCents).toBe(expectedCents);
      expect(partialLine.amountCents - fullLine.amountCents).toBe(0);
      expect(fullLine.amountCents - BALCONY_AREA_SQM * tileCents).toBe(
        BALCONY_LABOR_CENTS,
      );
    });
  });
});
