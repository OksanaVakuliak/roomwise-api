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
import {
  OptionKind,
  OptionUnit,
  PublicationStatus,
} from '../../src/generated/prisma/enums';
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
const REMOVED_BASE_RATES_PATH = '/api/v1/admin/pricing/base-rates';
const COEFFICIENTS_PATH = '/api/v1/admin/pricing/coefficients';
const ESTIMATES_PATH = '/api/v1/public/estimates';
const CENTS_PER_DOLLAR = 100;
const LAMINATE_ROOM_FLOOR_AREA_SQM = 20;
const FLOOR_WASTE_FACTOR = 1.1;
const LAMINATE_PRICE_CENTS = 2190;
const SEEDED_UNDERLAY = 2;
const NEW_UNDERLAY = 3.5;
const ESTIMATE_AREA_SQM = 60;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

type Method = 'get' | 'post' | 'patch' | 'delete';

interface CoefficientBody {
  id: string;
  key: string;
  value: number;
  revision: string;
  group: string;
  usedBy: Array<{ ruleId: string; ruleName: { en: string; uk: string } }>;
  usedByOptions: Array<{
    optionId: string;
    optionName: { en: string; uk: string };
  }>;
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

describe('admin coefficients e2e', () => {
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

  function laminateLine(body: EstimateBody): EstimateLine {
    const line = body.lines.find(
      (candidate) => candidate.productId === productIds.lightLaminateFlooring,
    );

    if (!line) {
      throw new Error('No laminate line');
    }

    return line;
  }

  it('no longer serves base rates', async () => {
    await authed('get', REMOVED_BASE_RATES_PATH).expect(404);
  });

  describe('authentication', () => {
    const routes: Array<{ method: Method; path: string }> = [
      { method: 'get', path: COEFFICIENTS_PATH },
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

  it('defaults the group and accepts an explicit one', async () => {
    const plain = await authed('post', COEFFICIENTS_PATH)
      .send(coefficientInput('group_default'))
      .expect(201);
    const labor = await authed('post', COEFFICIENTS_PATH)
      .send({ ...coefficientInput('group_labor'), group: 'LABOR' })
      .expect(201);

    expect(plain.body.group).toBe('MATERIAL_EXTRA');
    expect(labor.body.group).toBe('LABOR');
  });

  it('changes the group and filters the list by it', async () => {
    const spare = await authed('post', COEFFICIENTS_PATH)
      .send(coefficientInput('group_move'))
      .expect(201);

    const patched = await authed(
      'patch',
      `${COEFFICIENTS_PATH}/${spare.body.id}`,
    )
      .send({ group: 'PREPARATION', revision: spare.body.revision })
      .expect(200);

    expect(patched.body.group).toBe('PREPARATION');

    const filtered = await authed(
      'get',
      `${COEFFICIENTS_PATH}?group=PREPARATION`,
    ).expect(200);
    const items = filtered.body.items as CoefficientBody[];

    expect(items.map((item) => item.key)).toContain('group_move');
    expect(items.every((item) => item.group === 'PREPARATION')).toBe(true);

    await authed('get', `${COEFFICIENTS_PATH}?group=UNKNOWN`).expect(400);
  });

  it('rejects deleting a coefficient used by an option', async () => {
    const spare = await authed('post', COEFFICIENTS_PATH)
      .send(coefficientInput('option_priced'))
      .expect(201);
    const option = await testApp.prisma.option.create({
      data: {
        kind: OptionKind.ADDITIONAL,
        name: { en: 'Priced option', uk: 'Опція з ціною' },
        description: { en: 'Option', uk: 'Опція' },
        priceCents: null,
        unit: OptionUnit.PIECE,
        sortOrder: 99,
        status: PublicationStatus.DRAFT,
        priceCoefficientKeys: ['option_priced'],
      },
    });

    const response = await authed(
      'delete',
      `${COEFFICIENTS_PATH}/${spare.body.id}`,
    ).expect(409);

    expect(response.body.error.code).toBe(ERROR_CODES.COEFFICIENT_IN_USE);
    expect(response.body.error.params.options).toEqual([
      { optionId: option.id, optionName: option.name },
    ]);
    expect((await findCoefficient('option_priced')).usedByOptions).toHaveLength(
      1,
    );

    await testApp.prisma.option.delete({ where: { id: option.id } });
    await authed('delete', `${COEFFICIENTS_PATH}/${spare.body.id}`).expect(204);
  });

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

    await authed('delete', `${COEFFICIENTS_PATH}/${spare.body.id}`).expect(204);
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
      floorQuantity * (LAMINATE_PRICE_CENTS + NEW_UNDERLAY * CENTS_PER_DOLLAR),
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
