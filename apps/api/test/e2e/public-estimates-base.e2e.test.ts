import type {
  Configuration,
  Estimate,
  EstimateLine,
} from '@roomwise/calc-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { ruleIds } from '../../src/modules/pricing/dataset/data/rules';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const ESTIMATES_PATH = '/api/v1/public/estimates';
const COEFFICIENTS_PATH = '/api/v1/admin/pricing/coefficients';
const CENTS_PER_DOLLAR = 100;
const ROOM_HEIGHT_M = 2.7;
const SMALL_TOTAL_AREA_SQM = 15;
const FLAT_TOTAL_AREA_SQM = 60;
const LARGE_TOTAL_AREA_SQM = 500;
const FLAT_FLOOR_AREA_SQM = 60;
const FLAT_WALL_AREA_SQM = 180.9;
const FLAT_WET_ROOMS_COUNT = 2;
const KITCHEN_WALL_AREA_SQM = 37.8;
const PATCHED_WALL_PLASTER = 10;
const ROUGH_BASE_CENTS = 847_634;
const PRE_FINISH_BASE_CENTS = 240_273;
const LIVED_IN_BASE_CENTS = 560_969;
const ROUGH_LINES_COUNT = 7;
const LIVED_IN_LINES_COUNT = 6;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type FinishLevel = Configuration['finishLevel'];
type RoomConfiguration = Configuration['rooms'][number];
type RoomTypeCode = RoomConfiguration['roomTypeCode'];
type Selections = RoomConfiguration['selections'];
type RoomSpec = [RoomTypeCode, number, number];

const baseRuleIds: string[] = [
  ruleIds.baseDemolition,
  ruleIds.baseScreed,
  ruleIds.baseWallPlaster,
  ruleIds.baseCeilingPlaster,
  ruleIds.baseWallPutty,
  ruleIds.baseCeilingPutty,
  ruleIds.baseElectrics,
  ruleIds.basePlumbing,
];

const roughRuleIds = baseRuleIds.filter((id) => id !== ruleIds.baseDemolition);

const livedInRuleIds = baseRuleIds.filter(
  (id) => id !== ruleIds.baseScreed && id !== ruleIds.baseCeilingPlaster,
);

const preFinishRuleIds: string[] = [
  ruleIds.baseWallPutty,
  ruleIds.baseCeilingPutty,
];

const smallFlatSpecs: RoomSpec[] = [['LIVING_ROOM', 5, 3]];

const flatSpecs: RoomSpec[] = [
  ['LIVING_ROOM', 6, 4],
  ['BEDROOM', 4, 3.5],
  ['KITCHEN', 4, 3],
  ['BATHROOM', 3, 2],
  ['BEDROOM', 2, 2],
];

const largeFlatSpecs: RoomSpec[] = [
  ...Array.from({ length: 8 }, (): RoomSpec => ['LIVING_ROOM', 6, 5]),
  ...Array.from({ length: 4 }, (): RoomSpec => ['BEDROOM', 8, 5]),
  ['KITCHEN', 10, 5],
  ['BATHROOM', 5, 5],
  ['BEDROOM', 5, 5],
];

function coefficientValue(key: string): number {
  const coefficient = pricingDataset.coefficients.find(
    (item) => item.key === key,
  );

  if (!coefficient) {
    throw new Error(`Coefficient ${key} not found`);
  }

  return coefficient.value;
}

function coefficientCents(key: string): number {
  return Math.round(coefficientValue(key) * CENTS_PER_DOLLAR);
}

function unitCents(...keys: string[]): number {
  return keys.reduce((sum, key) => sum + coefficientCents(key), 0);
}

function room(
  clientId: string,
  roomTypeCode: RoomTypeCode,
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

function roomsOf(specs: RoomSpec[]): RoomConfiguration[] {
  return specs.map(([roomTypeCode, lengthM, widthM], index) =>
    room(`room-${index}`, roomTypeCode, lengthM, widthM),
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
    totalAreaSqm: FLAT_TOTAL_AREA_SQM,
    ...overrides,
  });
}

function baseLinesOf(estimate: Estimate): EstimateLine[] {
  return estimate.lines.filter((line) => line.section === 'BASE');
}

function sumCents(lines: EstimateLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}

function ruleIdsOf(lines: EstimateLine[]): Array<string | null> {
  return lines.map((line) => line.ruleId);
}

function lineOf(estimate: Estimate, id: string): EstimateLine {
  const line = estimate.lines.find((candidate) => candidate.id === id);

  if (!line) {
    throw new Error(`No estimate line ${id}`);
  }

  return line;
}

const expectedLineCents: Record<string, Record<FinishLevel, number>> = (() => {
  const demolition =
    FLAT_FLOOR_AREA_SQM *
      unitCents('prep_floor_demolition', 'mat_demolition_disposal') +
    FLAT_WALL_AREA_SQM * unitCents('prep_wall_stripping');
  const screed = FLAT_FLOOR_AREA_SQM * unitCents('prep_screed', 'mat_screed');
  const wallPlaster =
    FLAT_WALL_AREA_SQM * unitCents('prep_wall_plaster', 'mat_wall_plaster');
  const ceilingPlaster =
    FLAT_FLOOR_AREA_SQM *
    unitCents('prep_ceiling_plaster', 'mat_ceiling_plaster');
  const wallPutty =
    FLAT_WALL_AREA_SQM * unitCents('prep_wall_putty', 'mat_putty');
  const ceilingPutty =
    FLAT_FLOOR_AREA_SQM * unitCents('prep_ceiling_putty', 'mat_putty');
  const electrics =
    FLAT_FLOOR_AREA_SQM * unitCents('eng_electrics_sqm', 'mat_electrics_sqm');
  const plumbing =
    FLAT_WET_ROOMS_COUNT * unitCents('eng_plumbing_room', 'mat_plumbing_room');
  const round = (value: number) => Math.round(value);

  return {
    [ruleIds.baseDemolition]: {
      ROUGH: 0,
      PRE_FINISH: 0,
      LIVED_IN: round(demolition),
    },
    [ruleIds.baseScreed]: { ROUGH: round(screed), PRE_FINISH: 0, LIVED_IN: 0 },
    [ruleIds.baseWallPlaster]: {
      ROUGH: round(wallPlaster),
      PRE_FINISH: 0,
      LIVED_IN: round(
        wallPlaster * coefficientValue('lived_in_levelling_share'),
      ),
    },
    [ruleIds.baseCeilingPlaster]: {
      ROUGH: round(ceilingPlaster),
      PRE_FINISH: 0,
      LIVED_IN: 0,
    },
    [ruleIds.baseWallPutty]: {
      ROUGH: round(wallPutty),
      PRE_FINISH: round(wallPutty),
      LIVED_IN: round(wallPutty),
    },
    [ruleIds.baseCeilingPutty]: {
      ROUGH: round(ceilingPutty),
      PRE_FINISH: round(ceilingPutty),
      LIVED_IN: round(ceilingPutty),
    },
    [ruleIds.baseElectrics]: {
      ROUGH: round(electrics),
      PRE_FINISH: 0,
      LIVED_IN: round(electrics),
    },
    [ruleIds.basePlumbing]: {
      ROUGH: round(plumbing),
      PRE_FINISH: 0,
      LIVED_IN: round(plumbing),
    },
  };
})();

describe('public estimates base section on seed e2e', () => {
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

  function flatEstimate(
    finishLevel: FinishLevel,
    rooms: RoomConfiguration[] = roomsOf(flatSpecs),
  ): Promise<Estimate> {
    return estimateOf(full({ finishLevel, rooms }));
  }

  describe('finish levels of a 60 m² flat', () => {
    it('keeps the seed totals', async () => {
      const rough = await flatEstimate('ROUGH');
      const preFinish = await flatEstimate('PRE_FINISH');
      const livedIn = await flatEstimate('LIVED_IN');

      expect(rough.totals.sections.BASE.usdCents).toBe(ROUGH_BASE_CENTS);
      expect(preFinish.totals.sections.BASE.usdCents).toBe(
        PRE_FINISH_BASE_CENTS,
      );
      expect(livedIn.totals.sections.BASE.usdCents).toBe(LIVED_IN_BASE_CENTS);
    });

    it('builds a rough flat from seven lines in sort order', async () => {
      const lines = baseLinesOf(await flatEstimate('ROUGH'));

      expect(lines).toHaveLength(ROUGH_LINES_COUNT);
      expect(ruleIdsOf(lines)).toEqual(roughRuleIds);
    });

    it('builds a pre-finish flat from the two putty lines', async () => {
      const lines = baseLinesOf(await flatEstimate('PRE_FINISH'));

      expect(ruleIdsOf(lines)).toEqual(preFinishRuleIds);
    });

    it('builds a lived-in flat with demolition and without screed and ceiling plaster', async () => {
      const lines = baseLinesOf(await flatEstimate('LIVED_IN'));

      expect(lines).toHaveLength(LIVED_IN_LINES_COUNT);
      expect(ruleIdsOf(lines)).toEqual(livedInRuleIds);
    });

    it.each(['ROUGH', 'PRE_FINISH', 'LIVED_IN'] as const)(
      'prices every %s line from the seed coefficients',
      async (finishLevel) => {
        const estimate = await flatEstimate(finishLevel);
        const lines = baseLinesOf(estimate);

        for (const line of lines) {
          expect(line.status).toBe('OK');
          expect(line.amountCents).toBe(
            expectedLineCents[line.ruleId ?? ''][finishLevel],
          );
          expect(line.id).toBe(`BASE:${line.ruleId}`);
        }

        expect(estimate.totals.sections.BASE.usdCents).toBe(sumCents(lines));
      },
    );
  });

  describe('rough against pre-finish', () => {
    it.each([
      [SMALL_TOTAL_AREA_SQM, smallFlatSpecs],
      [FLAT_TOTAL_AREA_SQM, flatSpecs],
      [LARGE_TOTAL_AREA_SQM, largeFlatSpecs],
    ] as const)('costs more at %s m²', async (totalAreaSqm, specs) => {
      const rooms = roomsOf([...specs]);
      const configuration = { totalAreaSqm, rooms };
      const rough = await estimateOf(
        full({ ...configuration, finishLevel: 'ROUGH' }),
      );
      const preFinish = await estimateOf(
        full({ ...configuration, finishLevel: 'PRE_FINISH' }),
      );

      expect(rough.totals.sections.BASE.usdCents).toBeGreaterThan(
        preFinish.totals.sections.BASE.usdCents,
      );
      expect(preFinish.totals.sections.BASE.usdCents).toBeGreaterThan(0);
    });
  });

  describe('base lines carry no catalog references', () => {
    it.each(['ROUGH', 'PRE_FINISH', 'LIVED_IN'] as const)(
      'leaves category, product and material type empty in %s',
      async (finishLevel) => {
        const lines = baseLinesOf(await flatEstimate(finishLevel));

        expect(lines.length).toBeGreaterThan(0);

        for (const line of lines) {
          expect(line.categoryId).toBeNull();
          expect(line.productId).toBeNull();
          expect(baseRuleIds).toContain(line.ruleId);
        }
      },
    );

    it('does not change base lines when finish materials are selected', async () => {
      const plain = await flatEstimate('ROUGH');
      const rooms = roomsOf(flatSpecs);
      const bedroomIndex = flatSpecs.findIndex(([type]) => type === 'BEDROOM');
      const bedroom = rooms[bedroomIndex];
      const selections: Selections = [
        {
          categoryId: categoryIds.floorCovering,
          productId: productIds.lightLaminateFlooring,
        },
        {
          categoryId: categoryIds.wallPaint,
          productId: productIds.whiteMatteWallPaint,
        },
      ];
      const selected = await flatEstimate(
        'ROUGH',
        rooms.map((item) =>
          item === bedroom ? { ...item, selections } : item,
        ),
      );
      const materials = selected.lines.filter(
        (line) => line.section === 'MATERIALS',
      );

      expect(baseLinesOf(selected)).toEqual(baseLinesOf(plain));
      expect(selected.totals.sections.BASE.usdCents).toBe(
        plain.totals.sections.BASE.usdCents,
      );
      expect(materials.map((line) => line.categoryId)).toEqual(
        expect.arrayContaining([
          categoryIds.floorCovering,
          categoryIds.wallPaint,
        ]),
      );
      expect(plain.lines.some((line) => line.section === 'MATERIALS')).toBe(
        false,
      );
    });
  });

  describe('partial scope', () => {
    it.each(['ROUGH', 'PRE_FINISH', 'LIVED_IN'] as const)(
      'gives no base lines for %s',
      async (finishLevel) => {
        const estimate = await estimateOf(
          partial({ finishLevel, rooms: roomsOf(flatSpecs) }),
        );

        expect(baseLinesOf(estimate)).toEqual([]);
        expect(estimate.totals.sections.BASE.usdCents).toBe(0);
      },
    );
  });

  describe('wall plaster coefficient edited by an admin', () => {
    it('changes the base line and the walls preparation of a partial room together', async () => {
      const admin = await createAdmin(testApp.prisma);
      const cookie = await login(testApp.http, admin.login, admin.password);
      const kitchen = room('kitchen', 'KITCHEN', 4, 3, [
        {
          categoryId: categoryIds.wallPaint,
          productId: productIds.whiteMatteWallPaint,
        },
      ]);
      const paintLineId = `MATERIALS:kitchen:${categoryIds.wallPaint}`;
      const partialConfiguration = partial({
        finishLevel: 'ROUGH',
        rooms: [kitchen],
      });
      const plasterLineId = `BASE:${ruleIds.baseWallPlaster}`;

      async function plasterCoefficient() {
        const response = await request(testApp.http)
          .get(COEFFICIENTS_PATH)
          .set('Cookie', cookie)
          .expect(200);
        const item = (
          response.body.items as Array<{
            id: string;
            key: string;
            value: number;
            revision: string;
          }>
        ).find((candidate) => candidate.key === 'prep_wall_plaster');

        if (!item) {
          throw new Error('No coefficient prep_wall_plaster');
        }

        return item;
      }

      async function patchPlaster(value: number) {
        const { id, revision } = await plasterCoefficient();

        await request(testApp.http)
          .patch(`${COEFFICIENTS_PATH}/${id}`)
          .set('Cookie', cookie)
          .send({ value, revision })
          .expect(200);
      }

      const originalValue = coefficientValue('prep_wall_plaster');
      const before = {
        base: lineOf(await flatEstimate('ROUGH'), plasterLineId),
        paint: lineOf(await estimateOf(partialConfiguration), paintLineId),
      };

      try {
        await patchPlaster(PATCHED_WALL_PLASTER);

        const after = {
          base: lineOf(await flatEstimate('ROUGH'), plasterLineId),
          paint: lineOf(await estimateOf(partialConfiguration), paintLineId),
        };
        const prepOf = (line: EstimateLine) =>
          line.components?.find((component) => component.kind === 'PREP')
            ?.amountCents;
        const patchedPlasterCents = Math.round(
          PATCHED_WALL_PLASTER * CENTS_PER_DOLLAR,
        );
        const plasterUnitCents =
          patchedPlasterCents + coefficientCents('mat_wall_plaster');
        const puttyUnitCents = unitCents('prep_wall_putty', 'mat_putty');

        expect(after.base.amountCents).not.toBe(before.base.amountCents);
        expect(after.base.amountCents).toBe(
          Math.round(FLAT_WALL_AREA_SQM * plasterUnitCents),
        );
        expect(prepOf(after.paint)).not.toBe(prepOf(before.paint));
        expect(prepOf(after.paint)).toBe(
          Math.round(
            KITCHEN_WALL_AREA_SQM * (plasterUnitCents + puttyUnitCents),
          ),
        );
      } finally {
        await patchPlaster(originalValue);
        testApp.app.get(PricingDataService).invalidate();
      }

      const restored = {
        base: lineOf(await flatEstimate('ROUGH'), plasterLineId),
        paint: lineOf(await estimateOf(partialConfiguration), paintLineId),
      };

      expect(restored).toEqual(before);
    });
  });
});
