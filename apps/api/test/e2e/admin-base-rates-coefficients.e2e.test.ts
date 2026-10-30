import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
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
const BASE_RATES_PATH = '/api/v1/admin/pricing/base-rates';
const COEFFICIENTS_PATH = '/api/v1/admin/pricing/coefficients';
const ESTIMATES_PATH = '/api/v1/public/estimates';
const CENTS_PER_DOLLAR = 100;
const LAMINATE_ROOM_FLOOR_AREA_SQM = 20;
const FLOOR_WASTE_FACTOR = 1.1;
const LAMINATE_PRICE_CENTS = 2190;
const SEEDED_UNDERLAY = 2;
const NEW_UNDERLAY = 3.5;
const ESTIMATE_AREA_SQM = 60;
const ROUGH_RATE_CENTS = 8000;
const NEW_ROUGH_RATE_CENTS = 8500;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type Method = 'get' | 'post' | 'patch' | 'delete';

interface BaseRateBody {
  id: string;
  finishLevel: string;
  areaFromSqm: number;
  areaToSqm: number;
  rateCentsPerSqm: number;
  revision: string;
}

interface CoefficientBody {
  id: string;
  key: string;
  value: number;
  revision: string;
  usedBy: Array<{ ruleId: string; ruleName: { en: string; uk: string } }>;
}

interface EstimateLine {
  id: string;
  section: string;
  status: string;
  productId: string | null;
  quantity: number | null;
  amountCents: number;
  error: { code: string; params?: Record<string, unknown> } | null;
}

interface EstimateBody {
  lines: EstimateLine[];
  totals: { usdCents: number };
  incomplete: boolean;
}

function coefficientInput(key: string, value = 1) {
  return {
    key,
    name: { en: 'Spare', uk: 'Запасний' },
    value,
    unit: { en: '$ per m²', uk: '$ за м²' },
  };
}

describe('admin base rates and coefficients e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;

  beforeAll(async () => {
    testApp = await createTestApp();

    await testApp.prisma.$transaction(
      (tx) => testApp.app.get(CatalogDatasetService).upsert(catalogDataset, tx),
      { timeout: SEED_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );

    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);
  });

  beforeEach(async () => {
    await testApp.prisma.$transaction(
      async (tx) => {
        await tx.baseRate.deleteMany();
        await tx.coefficient.deleteMany({
          where: {
            key: { notIn: pricingDataset.coefficients.map((item) => item.key) },
          },
        });

        for (const coefficient of pricingDataset.coefficients) {
          await tx.coefficient.updateMany({
            where: { key: coefficient.key },
            data: { value: coefficient.value },
          });
        }
      },
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

  function authed(method: Method, path: string) {
    return request(testApp.http)[method](path).set('Cookie', adminCookie);
  }

  async function listBaseRates() {
    const response = await authed('get', BASE_RATES_PATH).expect(200);

    return response.body as {
      items: BaseRateBody[];
      gaps: Array<{ finishLevel: string; fromSqm: number; toSqm: number }>;
    };
  }

  async function findBaseRate(
    finishLevel: string,
    areaFromSqm: number,
  ): Promise<BaseRateBody> {
    const rate = (await listBaseRates()).items.find(
      (item) =>
        item.finishLevel === finishLevel && item.areaFromSqm === areaFromSqm,
    );

    if (!rate) {
      throw new Error(`No ${finishLevel} range from ${areaFromSqm}`);
    }

    return rate;
  }

  async function listCoefficients(): Promise<CoefficientBody[]> {
    const response = await authed('get', COEFFICIENTS_PATH).expect(200);

    return response.body.items as CoefficientBody[];
  }

  async function findCoefficient(key: string): Promise<CoefficientBody> {
    const coefficient = (await listCoefficients()).find(
      (item) => item.key === key,
    );

    if (!coefficient) {
      throw new Error(`No coefficient ${key}`);
    }

    return coefficient;
  }

  async function estimate() {
    const response = await request(testApp.http)
      .post(ESTIMATES_PATH)
      .send({
        configuration: {
          finishLevel: 'ROUGH',
          totalAreaSqm: ESTIMATE_AREA_SQM,
          balconyAreaSqm: 0,
          balconyTiles: false,
          kitchenType: 'SEPARATE',
          currency: 'USD',
          options: [],
          rooms: [
            {
              clientId: 'laminate-room',
              roomTypeCode: 'BEDROOM',
              lengthM: 5,
              widthM: 4,
              heightM: 2.7,
              heatedFloor: false,
              selections: [
                {
                  categoryId: categoryIds.floorCovering,
                  productId: productIds.lightLaminateFlooring,
                },
              ],
            },
          ],
        },
      })
      .expect(200);

    return response.body.estimate as EstimateBody;
  }

  function lineBySection(body: EstimateBody, section: string): EstimateLine {
    const line = body.lines.find((candidate) => candidate.section === section);

    if (!line) {
      throw new Error(`No ${section} line`);
    }

    return line;
  }

  function laminateLine(body: EstimateBody): EstimateLine {
    const line = body.lines.find(
      (candidate) => candidate.productId === productIds.lightLaminateFlooring,
    );

    if (!line) {
      throw new Error('No laminate line');
    }

    return line;
  }

  describe('authentication', () => {
    const routes: Array<{ method: Method; path: string }> = [
      { method: 'get', path: BASE_RATES_PATH },
      { method: 'post', path: COEFFICIENTS_PATH },
    ];

    for (const route of routes) {
      it(`rejects ${route.method} ${route.path} without a session`, async () => {
        const response = await request(testApp.http)[route.method](route.path);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: { code: ERROR_CODES.UNAUTHENTICATED },
        });
      });
    }
  });

  describe('base rates', () => {
    it('lists seeded ranges without gaps', async () => {
      const { items, gaps } = await listBaseRates();

      expect(items.length).toBe(pricingDataset.baseRates.length);
      expect(gaps).toEqual([]);
    });

    it('rejects a range overlapping an existing one with the conflict', async () => {
      const existing = await findBaseRate('ROUGH', 15);

      const response = await authed('post', BASE_RATES_PATH)
        .send({
          finishLevel: 'ROUGH',
          areaFromSqm: 20,
          areaToSqm: 35,
          rateCentsPerSqm: 9100,
        })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.RANGE_OVERLAP);
      expect(response.body.error.params.conflict).toEqual({
        id: existing.id,
        areaFromSqm: 15,
        areaToSqm: 30,
      });
    });

    it('accepts adjacent ranges', async () => {
      const middle = await findBaseRate('ROUGH', 30);
      await authed('delete', `${BASE_RATES_PATH}/${middle.id}`).expect(204);

      const first = await authed('post', BASE_RATES_PATH)
        .send({
          finishLevel: 'ROUGH',
          areaFromSqm: 30,
          areaToSqm: 40,
          rateCentsPerSqm: 9100,
        })
        .expect(201);
      const second = await authed('post', BASE_RATES_PATH)
        .send({
          finishLevel: 'ROUGH',
          areaFromSqm: 40,
          areaToSqm: 45,
          rateCentsPerSqm: 9050,
        })
        .expect(201);

      expect(first.body).toMatchObject({ areaFromSqm: 30, areaToSqm: 40 });
      expect(second.body).toMatchObject({ areaFromSqm: 40, areaToSqm: 45 });
      expect((await listBaseRates()).gaps).toEqual([]);
    });

    it('allows the same range on another finish level', async () => {
      const preFinish = await findBaseRate('PRE_FINISH', 30);
      const rough = await findBaseRate('ROUGH', 30);
      await authed('delete', `${BASE_RATES_PATH}/${rough.id}`).expect(204);

      const response = await authed('post', BASE_RATES_PATH)
        .send({
          finishLevel: 'ROUGH',
          areaFromSqm: preFinish.areaFromSqm,
          areaToSqm: preFinish.areaToSqm,
          rateCentsPerSqm: 9000,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        finishLevel: 'ROUGH',
        areaFromSqm: 30,
        areaToSqm: 45,
      });
    });

    it('rejects an update that grows into a neighbour', async () => {
      const middle = await findBaseRate('ROUGH', 30);
      const neighbour = await findBaseRate('ROUGH', 15);

      const response = await authed('patch', `${BASE_RATES_PATH}/${middle.id}`)
        .send({ areaFromSqm: 25, revision: middle.revision })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.RANGE_OVERLAP);
      expect(response.body.error.params.conflict.id).toBe(neighbour.id);
    });

    it('updates a rate and rotates the revision', async () => {
      const middle = await findBaseRate('ROUGH', 30);

      const response = await authed('patch', `${BASE_RATES_PATH}/${middle.id}`)
        .send({ rateCentsPerSqm: 9999, revision: middle.revision })
        .expect(200);

      expect(response.body.rateCentsPerSqm).toBe(9999);
      expect(response.body.revision).not.toBe(middle.revision);
    });

    it('rejects a stale revision', async () => {
      const middle = await findBaseRate('ROUGH', 30);

      const response = await authed('patch', `${BASE_RATES_PATH}/${middle.id}`)
        .send({ rateCentsPerSqm: 9999, revision: randomUUID() })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect(response.body.error.params.currentRevision).toBe(middle.revision);
    });

    it('answers 404 for an unknown range id on delete', async () => {
      await authed('delete', `${BASE_RATES_PATH}/${randomUUID()}`).expect(404);
    });

    it('reports gaps inside the total area limits', async () => {
      const middle = await findBaseRate('ROUGH', 30);
      const last = await findBaseRate('PRE_FINISH', 400);

      await authed('delete', `${BASE_RATES_PATH}/${middle.id}`).expect(204);
      await authed('patch', `${BASE_RATES_PATH}/${last.id}`)
        .send({ areaToSqm: 450, revision: last.revision })
        .expect(200);

      const { gaps } = await listBaseRates();

      expect(gaps).toEqual([
        { finishLevel: 'ROUGH', fromSqm: 30, toSqm: 45 },
        { finishLevel: 'PRE_FINISH', fromSqm: 450, toSqm: 500 },
      ]);
    });

    it('marks the base cost as not calculated when the area is uncovered', async () => {
      const covering = await findBaseRate('ROUGH', 55);

      await authed('delete', `${BASE_RATES_PATH}/${covering.id}`).expect(204);

      const body = await estimate();
      const base = lineBySection(body, 'BASE');

      expect(base.status).toBe('NOT_CALCULATED');
      expect(base.amountCents).toBe(0);
      expect(base.error).toEqual({
        code: 'BASE_RATE_NOT_FOUND',
        params: { totalAreaSqm: ESTIMATE_AREA_SQM, finishLevel: 'ROUGH' },
      });
      expect(body.incomplete).toBe(true);
      expect(laminateLine(body).status).toBe('OK');
    });

    it('changes the reference estimate by the new rate', async () => {
      const before = await estimate();

      expect(lineBySection(before, 'BASE').amountCents).toBe(
        ESTIMATE_AREA_SQM * ROUGH_RATE_CENTS,
      );

      const rate = await findBaseRate('ROUGH', 55);
      await authed('patch', `${BASE_RATES_PATH}/${rate.id}`)
        .send({
          rateCentsPerSqm: NEW_ROUGH_RATE_CENTS,
          revision: rate.revision,
        })
        .expect(200);

      const after = await estimate();

      expect(lineBySection(after, 'BASE').amountCents).toBe(
        ESTIMATE_AREA_SQM * NEW_ROUGH_RATE_CENTS,
      );
      expect(after.totals.usdCents - before.totals.usdCents).toBe(
        ESTIMATE_AREA_SQM * (NEW_ROUGH_RATE_CENTS - ROUGH_RATE_CENTS),
      );
    });
  });

  describe('coefficients', () => {
    it('lists the rules that use each coefficient', async () => {
      const underlay = await findCoefficient('laminate_underlay');
      const glue = await findCoefficient('tile_glue');

      expect(underlay.usedBy.map((usage) => usage.ruleId)).toContain(
        ruleIds.laminateFloor,
      );
      expect(underlay.usedBy[0].ruleName).toEqual({
        en: 'Laminate with underlay',
        uk: 'Ламінат з підкладкою',
      });
      expect(glue.usedBy.length).toBeGreaterThan(0);
    });

    it('rejects a duplicate key on create', async () => {
      const response = await authed('post', COEFFICIENTS_PATH)
        .send(coefficientInput('tile_glue'))
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.KEY_TAKEN);
    });

    it('rejects renaming to a taken key', async () => {
      const spare = await authed('post', COEFFICIENTS_PATH)
        .send(coefficientInput('spare_one'))
        .expect(201);

      const response = await authed(
        'patch',
        `${COEFFICIENTS_PATH}/${spare.body.id}`,
      )
        .send({ key: 'tile_glue', revision: spare.body.revision })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.KEY_TAKEN);
    });

    it('rejects deleting a coefficient used by a rule', async () => {
      const underlay = await findCoefficient('laminate_underlay');

      const response = await authed(
        'delete',
        `${COEFFICIENTS_PATH}/${underlay.id}`,
      ).expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.COEFFICIENT_IN_USE);
      expect(response.body.error.params.rules).toEqual(underlay.usedBy);
      expect(await findCoefficient('laminate_underlay')).toBeDefined();
    });

    it('rejects changing the key of a coefficient used by a rule', async () => {
      const underlay = await findCoefficient('laminate_underlay');

      const response = await authed(
        'patch',
        `${COEFFICIENTS_PATH}/${underlay.id}`,
      )
        .send({ key: 'laminate_pad', revision: underlay.revision })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.COEFFICIENT_IN_USE);
      expect(response.body.error.params.rules).toEqual(underlay.usedBy);
    });

    it('allows changing only the value of a used coefficient', async () => {
      const underlay = await findCoefficient('laminate_underlay');

      const response = await authed(
        'patch',
        `${COEFFICIENTS_PATH}/${underlay.id}`,
      )
        .send({ value: NEW_UNDERLAY, revision: underlay.revision })
        .expect(200);

      expect(response.body.value).toBe(NEW_UNDERLAY);
      expect(response.body.key).toBe('laminate_underlay');
      expect(response.body.usedBy).toEqual(underlay.usedBy);
    });

    it('rejects a stale revision', async () => {
      const underlay = await findCoefficient('laminate_underlay');

      const response = await authed(
        'patch',
        `${COEFFICIENTS_PATH}/${underlay.id}`,
      )
        .send({ value: 5, revision: randomUUID() })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
    });

    it('renames and deletes an unused coefficient', async () => {
      const spare = await authed('post', COEFFICIENTS_PATH)
        .send(coefficientInput('spare_two'))
        .expect(201);

      expect(spare.body.usedBy).toEqual([]);

      const renamed = await authed(
        'patch',
        `${COEFFICIENTS_PATH}/${spare.body.id}`,
      )
        .send({ key: 'spare_three', revision: spare.body.revision })
        .expect(200);

      expect(renamed.body.key).toBe('spare_three');

      await authed('delete', `${COEFFICIENTS_PATH}/${spare.body.id}`).expect(
        204,
      );
      expect(
        (await listCoefficients()).some((item) => item.key === 'spare_three'),
      ).toBe(false);
    });

    it('changes the reference estimate by the new underlay value', async () => {
      const before = await estimate();
      const floorQuantity = LAMINATE_ROOM_FLOOR_AREA_SQM * FLOOR_WASTE_FACTOR;
      const beforeAmount = Math.round(
        floorQuantity *
          (LAMINATE_PRICE_CENTS + SEEDED_UNDERLAY * CENTS_PER_DOLLAR),
      );
      const afterAmount = Math.round(
        floorQuantity *
          (LAMINATE_PRICE_CENTS + NEW_UNDERLAY * CENTS_PER_DOLLAR),
      );

      expect(laminateLine(before).quantity).toBeCloseTo(floorQuantity, 3);
      expect(laminateLine(before).amountCents).toBe(beforeAmount);

      const underlay = await findCoefficient('laminate_underlay');
      await authed('patch', `${COEFFICIENTS_PATH}/${underlay.id}`)
        .send({ value: NEW_UNDERLAY, revision: underlay.revision })
        .expect(200);

      const after = await estimate();

      expect(laminateLine(after).amountCents).toBe(afterAmount);
      expect(after.totals.usdCents - before.totals.usdCents).toBe(
        afterAmount - beforeAmount,
      );
    });
  });
});
