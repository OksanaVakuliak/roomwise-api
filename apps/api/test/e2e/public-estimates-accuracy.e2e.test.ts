import type {
  Configuration,
  Estimate,
  EstimateLine,
  LineComponent,
} from '@roomwise/calc-engine';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import {
  OptionKind,
  OptionUnit,
  PublicationStatus,
} from '../../src/generated/prisma/enums';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { optionIds } from '../../src/modules/catalog/dataset/data/options';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { ruleIds } from '../../src/modules/pricing/dataset/data/rules';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { buildOptionInput } from './admin-engineering-fixtures';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const ESTIMATES_PATH = '/api/v1/public/estimates';
const COEFFICIENTS_PATH = '/api/v1/admin/pricing/coefficients';
const OPTIONS_PATH = '/api/v1/admin/options';
const CENTS_PER_DOLLAR = 100;
const ROOM_HEIGHT_M = 2.7;
const FULL_TOTAL_AREA_SQM = 60;
const BEDROOM_LENGTH_M = 4;
const BEDROOM_WIDTH_M = 3;
const BATHROOM_LENGTH_M = 3;
const BATHROOM_WIDTH_M = 2;
const BALCONY_AREA_SQM = 5;
const COEFFICIENT_RAISE_DOLLARS = 1;
const PRICE_KEY = 'mat_electrics_sqm';

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type RoomConfiguration = Configuration['rooms'][number];
type Selections = RoomConfiguration['selections'];

interface CoefficientBody {
  id: string;
  key: string;
  value: number;
  revision: string;
}

interface PublicOption {
  id: string;
  priceCents: number | null;
  priceCoefficientKeys: string[];
}

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

function bathroom(selections: Selections = []): RoomConfiguration {
  return room(
    'bathroom',
    'BATHROOM',
    BATHROOM_LENGTH_M,
    BATHROOM_WIDTH_M,
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

function optionLineOf(estimate: Estimate, optionId: string): EstimateLine {
  const line = estimate.lines.find((item) => item.optionId === optionId);

  if (!line) {
    throw new Error(`No option line ${optionId}`);
  }

  return line;
}

function wallAreaOf(lengthM: number, widthM: number): number {
  return 2 * (lengthM + widthM) * ROOM_HEIGHT_M;
}

describe('public estimates accuracy on seed e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;
  const changedKeys = new Set<string>();

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

    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);
  });

  afterEach(async () => {
    for (const key of changedKeys) {
      await testApp.prisma.coefficient.updateMany({
        where: { key },
        data: { value: coefficientValue(key) },
      });
    }

    changedKeys.clear();
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

  async function raiseCoefficient(key: string): Promise<number> {
    const listed = await request(testApp.http)
      .get(COEFFICIENTS_PATH)
      .set('Cookie', adminCookie)
      .expect(200);
    const coefficient = (listed.body.items as CoefficientBody[]).find(
      (item) => item.key === key,
    );

    if (!coefficient) {
      throw new Error(`No coefficient ${key}`);
    }

    const value = coefficient.value + COEFFICIENT_RAISE_DOLLARS;
    changedKeys.add(key);
    await request(testApp.http)
      .patch(`${COEFFICIENTS_PATH}/${coefficient.id}`)
      .set('Cookie', adminCookie)
      .send({ value, revision: coefficient.revision })
      .expect(200);

    return value;
  }

  function createOption(overrides: Parameters<typeof buildOptionInput>[0]) {
    return request(testApp.http)
      .post(OPTIONS_PATH)
      .set('Cookie', adminCookie)
      .send(buildOptionInput(overrides));
  }

  describe('options priced from coefficients', () => {
    const bedroomArea = BEDROOM_LENGTH_M * BEDROOM_WIDTH_M;
    const electricsConfiguration = partial({
      rooms: [bedroom()],
      options: [
        { optionId: optionIds.replaceElectrics, roomClientIds: ['bedroom'] },
      ],
    });

    it('serves seeded options without a price and with coefficient keys', async () => {
      const response = await request(testApp.http)
        .get('/api/v1/public/engineering')
        .query({ lang: 'en' })
        .expect(200);
      const options = response.body.options as PublicOption[];

      for (const optionId of [
        optionIds.replaceElectrics,
        optionIds.replacePipes,
      ]) {
        const option = options.find((item) => item.id === optionId);

        expect(option?.priceCents).toBeNull();
        expect(option?.priceCoefficientKeys.length).toBeGreaterThan(0);
      }
    });

    it('computes the option line amount from its coefficients', async () => {
      const line = optionLineOf(
        await estimateOf(electricsConfiguration),
        optionIds.replaceElectrics,
      );
      const unitPriceCents = unitCents('eng_electrics_sqm', PRICE_KEY);

      expect(line.status).toBe('OK');
      expect(line.unitPriceCents).toBe(unitPriceCents);
      expect(line.amountCents).toBe(Math.round(bedroomArea * unitPriceCents));
    });

    it('changes the option line amount when its coefficient changes', async () => {
      const before = await estimateOf(electricsConfiguration);
      const value = await raiseCoefficient(PRICE_KEY);
      const after = await estimateOf(electricsConfiguration);
      const unitPriceCents =
        unitCents('eng_electrics_sqm') + Math.round(value * CENTS_PER_DOLLAR);
      const afterAmount = Math.round(bedroomArea * unitPriceCents);

      expect(optionLineOf(after, optionIds.replaceElectrics).amountCents).toBe(
        afterAmount,
      );
      expect(after.totals.usdCents - before.totals.usdCents).toBe(
        afterAmount -
          optionLineOf(before, optionIds.replaceElectrics).amountCents,
      );
    });
  });

  describe('option price source', () => {
    it('rejects creating an option with both a price and coefficient keys', async () => {
      const response = await createOption({
        priceCents: 1500,
        priceCoefficientKeys: [PRICE_KEY],
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('rejects creating an option with neither a price nor coefficient keys', async () => {
      const response = await createOption({
        priceCents: null,
        priceCoefficientKeys: [],
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('rejects a patch that leaves an option with both sources or none', async () => {
      const created = await createOption({ priceCents: 1500 });

      const both = await request(testApp.http)
        .patch(`${OPTIONS_PATH}/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({
          priceCoefficientKeys: [PRICE_KEY],
          revision: created.body.revision,
        });
      const neither = await request(testApp.http)
        .patch(`${OPTIONS_PATH}/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ priceCents: null, revision: created.body.revision });

      expect(both.status).toBe(400);
      expect(both.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(neither.status).toBe(400);
      expect(neither.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('rejects both sources or none written straight to the database', async () => {
      const data = {
        kind: OptionKind.ADDITIONAL,
        name: { en: 'Raw option', uk: 'Сира опція' },
        description: { en: 'Option', uk: 'Опція' },
        unit: OptionUnit.PIECE,
        sortOrder: 99,
        status: PublicationStatus.DRAFT,
      };

      await expect(
        testApp.prisma.option.create({
          data: {
            ...data,
            priceCents: 1500,
            priceCoefficientKeys: [PRICE_KEY],
          },
        }),
      ).rejects.toThrow();
      await expect(
        testApp.prisma.option.create({
          data: { ...data, priceCents: null, priceCoefficientKeys: [] },
        }),
      ).rejects.toThrow();
    });
  });

  describe('balcony tiles', () => {
    it('costs the same in both scopes and includes installation labour', async () => {
      const balcony = {
        balconyAreaSqm: BALCONY_AREA_SQM,
        balconyTiles: true,
        rooms: [bedroom()],
      };
      const fullEstimate = await estimateOf(full(balcony));
      const partialEstimate = await estimateOf(partial(balcony));
      const lineIn = (estimate: Estimate) =>
        estimate.lines.find((item) => item.ruleId === ruleIds.balconyTile);

      expect(lineIn(fullEstimate)?.amountCents).toBe(
        BALCONY_AREA_SQM * unitCents('balcony_tile', 'labor_balcony_tile'),
      );
      expect(lineIn(partialEstimate)?.amountCents).toBe(
        lineIn(fullEstimate)?.amountCents,
      );
    });
  });

  describe('wall putty', () => {
    const wallArea = wallAreaOf(BATHROOM_LENGTH_M, BATHROOM_WIDTH_M);
    const plasterPerSqmCents = unitCents(
      'prep_wall_plaster',
      'mat_wall_plaster',
    );
    const puttyPerSqmCents = unitCents('prep_wall_putty', 'mat_putty');
    const tile = {
      categoryId: categoryIds.wallTile,
      productId: productIds.whiteGlossyWallTile,
    };
    const paint = {
      categoryId: categoryIds.wallPaint,
      productId: productIds.whiteMatteWallPaint,
    };

    it('prepares walls under tile only with plaster and no putty', async () => {
      const estimate = await estimateOf(
        partial({ finishLevel: 'ROUGH', rooms: [bathroom([tile])] }),
      );
      const prep = componentOf(
        lineOf(estimate, materialLineId('bathroom', categoryIds.wallTile)),
        'PREP',
      );

      expect(prep.amountCents).toBe(Math.round(wallArea * plasterPerSqmCents));
      expect(prep.amountCents).toBeLessThan(
        Math.round(wallArea * (plasterPerSqmCents + puttyPerSqmCents)),
      );
    });

    it('prepares walls under paint and tile with plaster and putty once', async () => {
      const estimate = await estimateOf(
        partial({ finishLevel: 'ROUGH', rooms: [bathroom([paint, tile])] }),
      );
      const paintPrep = componentOf(
        lineOf(estimate, materialLineId('bathroom', categoryIds.wallPaint)),
        'PREP',
      );
      const tilePrep = componentOf(
        lineOf(estimate, materialLineId('bathroom', categoryIds.wallTile)),
        'PREP',
      );
      const expectedCents = Math.round(
        wallArea * (plasterPerSqmCents + puttyPerSqmCents),
      );

      expect(paintPrep.amountCents).toBe(expectedCents);
      expect(tilePrep.amountCents).toBe(0);
      expect(paintPrep.amountCents + tilePrep.amountCents).toBe(expectedCents);
    });

    it('excludes tile-only walls from base wall putty in full renovation', async () => {
      const bedroomWallArea = wallAreaOf(BEDROOM_LENGTH_M, BEDROOM_WIDTH_M);
      const estimate = await estimateOf(
        full({
          rooms: [bathroom([tile]), bedroom([paint])],
        }),
      );

      expect(
        lineOf(estimate, `BASE:${ruleIds.baseWallPutty}`).amountCents,
      ).toBe(Math.round(bedroomWallArea * puttyPerSqmCents));
    });
  });

  describe('stripping disposal', () => {
    const wallArea = wallAreaOf(BEDROOM_LENGTH_M, BEDROOM_WIDTH_M);
    const ceilingArea = BEDROOM_LENGTH_M * BEDROOM_WIDTH_M;
    const selections: Selections = [
      {
        categoryId: categoryIds.wallPaint,
        productId: productIds.whiteMatteWallPaint,
      },
      {
        categoryId: categoryIds.ceilingFinish,
        productId: productIds.whiteMatteCeilingPaint,
      },
    ];

    function preparationCents(disposalCents: number) {
      return {
        wall: Math.round(
          wallArea *
            (coefficientCents('prep_wall_stripping') +
              disposalCents +
              unitCents('prep_wall_putty', 'mat_putty')),
        ),
        ceiling: Math.round(
          ceilingArea *
            (coefficientCents('prep_ceiling_stripping') +
              disposalCents +
              unitCents('prep_ceiling_putty', 'mat_putty')),
        ),
      };
    }

    function demolitionCents(disposalCents: number): number {
      return Math.round(
        ceilingArea *
          unitCents('prep_floor_demolition', 'mat_demolition_disposal') +
          wallArea * (coefficientCents('prep_wall_stripping') + disposalCents),
      );
    }

    function preparationOf(estimate: Estimate) {
      return {
        wall: componentOf(
          lineOf(estimate, materialLineId('bedroom', categoryIds.wallPaint)),
          'PREP',
        ).amountCents,
        ceiling: componentOf(
          lineOf(
            estimate,
            materialLineId('bedroom', categoryIds.ceilingFinish),
          ),
          'PREP',
        ).amountCents,
      };
    }

    function demolitionOf(estimate: Estimate): number {
      return lineOf(estimate, `BASE:${ruleIds.baseDemolition}`).amountCents;
    }

    it('adds debris disposal to wall and ceiling preparation and to base demolition', async () => {
      const disposalCents = coefficientCents('mat_stripping_disposal');
      const preparation = await estimateOf(
        partial({ rooms: [bedroom(selections)] }),
      );
      const base = await estimateOf(full({ rooms: [bedroom(selections)] }));

      expect(preparationOf(preparation)).toEqual(
        preparationCents(disposalCents),
      );
      expect(demolitionOf(base)).toBe(demolitionCents(disposalCents));
    });

    it('changes preparation and base demolition with the disposal coefficient', async () => {
      const preparationBefore = preparationOf(
        await estimateOf(partial({ rooms: [bedroom(selections)] })),
      );
      const demolitionBefore = demolitionOf(
        await estimateOf(full({ rooms: [bedroom(selections)] })),
      );
      const value = await raiseCoefficient('mat_stripping_disposal');
      const disposalCents = Math.round(value * CENTS_PER_DOLLAR);
      const preparationAfter = preparationOf(
        await estimateOf(partial({ rooms: [bedroom(selections)] })),
      );
      const demolitionAfter = demolitionOf(
        await estimateOf(full({ rooms: [bedroom(selections)] })),
      );

      expect(preparationAfter).toEqual(preparationCents(disposalCents));
      expect(preparationAfter.wall).toBeGreaterThan(preparationBefore.wall);
      expect(preparationAfter.ceiling).toBeGreaterThan(
        preparationBefore.ceiling,
      );
      expect(demolitionAfter).toBe(demolitionCents(disposalCents));
      expect(demolitionAfter).toBeGreaterThan(demolitionBefore);
    });
  });
});
