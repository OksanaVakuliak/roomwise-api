import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { materialTypeIds } from '../../src/modules/catalog/dataset/data/material-types';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { ruleIds } from '../../src/modules/pricing/dataset/data/rules';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const RULES_PATH = '/api/v1/admin/pricing/rules';
const VALIDATE_PATH = '/api/v1/admin/pricing/formulas/validate';
const ESTIMATES_PATH = '/api/v1/public/estimates';
const PRICING_DATA_PATH = '/api/v1/public/pricing-data';
const UNKNOWN_VARIABLE_FORMULA = 'floorAria * (1 + waste)';
const SYNTAX_ERROR_FORMULA = 'quantity * (price +';
const UNKNOWN_COEFFICIENT_FORMULA = 'quantity * (price + coef.nope)';
const DOUBLED_COST_FORMULA = 'quantity * price * 2';
const VINYL_COST_FORMULA = 'quantity * (price + 5)';
const FLOOR_QUANTITY = 'floorArea * (1 + waste)';

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

interface FormulaIssueBody {
  formula: string;
  code: string;
  position: number;
  params?: Record<string, unknown>;
}

interface RuleBody {
  id: string;
  level: string;
  categoryId: string | null;
  materialTypeId: string | null;
  costFormula: string;
  sortOrder: number;
  revision: string;
  updatedBy: { id: string; login: string } | null;
}

interface EstimateLine {
  productId: string | null;
  ruleId: string | null;
  quantity: number | null;
  amountCents: number;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const livingRoomSample = {
  room: {
    roomTypeCode: 'LIVING_ROOM',
    lengthM: 5,
    widthM: 4,
    heightM: 2.7,
    heatedFloor: false,
  },
  product: { priceCents: 1800, unit: 'SQM', wastePercent: 5 },
  object: {
    totalAreaSqm: 60,
    balconyAreaSqm: 0,
    balconyTiles: false,
    kitchenType: 'SEPARATE',
    finishLevel: 'ROUGH',
    roomsCount: 2,
    bathroomsCount: 1,
  },
};

function buildRuleInput(overrides: Record<string, unknown> = {}) {
  return {
    level: 'CATEGORY',
    categoryId: categoryIds.ceilingFinish,
    name: { en: 'Rule', uk: 'Правило' },
    quantityFormula: FLOOR_QUANTITY,
    costFormula: 'quantity * price',
    ...overrides,
  };
}

function floorRoom(clientId: string, productId: string, length: number) {
  return {
    clientId,
    roomTypeCode: 'BEDROOM',
    lengthM: length,
    widthM: 4,
    heightM: 2.7,
    heatedFloor: false,
    selections: [{ categoryId: categoryIds.floorCovering, productId }],
  };
}

describe('admin pricing rules e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;
  let adminId: string;

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
    adminId = admin.id;
    adminCookie = await login(testApp.http, admin.login, admin.password);
  });

  afterAll(async () => {
    await testApp.close();
  });

  function authed(method: Method, path: string) {
    return request(testApp.http)[method](path).set('Cookie', adminCookie);
  }

  async function listRules() {
    const response = await authed('get', RULES_PATH).expect(200);

    return response.body as {
      items: RuleBody[];
      categoriesWithoutRule: Array<{ id: string }>;
    };
  }

  async function findRule(id: string): Promise<RuleBody> {
    const rule = (await listRules()).items.find((item) => item.id === id);

    if (!rule) {
      throw new Error(`Rule ${id} not found`);
    }

    return rule;
  }

  async function estimateLines(): Promise<EstimateLine[]> {
    const response = await request(testApp.http)
      .post(ESTIMATES_PATH)
      .send({
        configuration: {
          finishLevel: 'ROUGH',
          totalAreaSqm: 60,
          balconyAreaSqm: 0,
          balconyTiles: false,
          kitchenType: 'SEPARATE',
          currency: 'USD',
          options: [],
          rooms: [
            floorRoom('parquet-room', productIds.whiteOakParquetPlank, 5),
            floorRoom('vinyl-room', productIds.greySpcVinylPlank, 4),
            floorRoom('laminate-room', productIds.lightLaminateFlooring, 3),
          ],
        },
      })
      .expect(200);

    return response.body.estimate.lines as EstimateLine[];
  }

  function lineOf(lines: EstimateLine[], productId: string): EstimateLine {
    const line = lines.find((candidate) => candidate.productId === productId);

    if (!line) {
      throw new Error(`No estimate line for product ${productId}`);
    }

    return line;
  }

  describe('authentication', () => {
    const routes: Array<{ method: Method; path: string }> = [
      { method: 'get', path: RULES_PATH },
      { method: 'post', path: RULES_PATH },
      { method: 'patch', path: `${RULES_PATH}/${randomUUID()}` },
      { method: 'put', path: `${RULES_PATH}/order` },
      { method: 'delete', path: `${RULES_PATH}/${randomUUID()}` },
      { method: 'post', path: `${RULES_PATH}/preview` },
      { method: 'post', path: VALIDATE_PATH },
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

  describe('formula validation', () => {
    it('reports an unknown variable with a suggestion on validate', async () => {
      const response = await authed('post', VALIDATE_PATH)
        .send({
          level: 'CATEGORY',
          quantityFormula: UNKNOWN_VARIABLE_FORMULA,
          costFormula: 'quantity * price',
        })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0]).toMatchObject({
        formula: 'quantity',
        code: 'UNKNOWN_VARIABLE',
        position: 0,
        params: { suggestion: 'floorArea' },
      });
    });

    it('rejects saving a rule with an unknown variable', async () => {
      const response = await authed('post', RULES_PATH)
        .send(buildRuleInput({ quantityFormula: UNKNOWN_VARIABLE_FORMULA }))
        .expect(422);

      expect(response.body.error.code).toBe(ERROR_CODES.FORMULA_INVALID);
      expect(response.body.error.params.errors[0]).toMatchObject({
        formula: 'quantity',
        code: 'UNKNOWN_VARIABLE',
        position: 0,
        params: { suggestion: 'floorArea' },
      });
    });

    it('reports a syntax error with a position', async () => {
      const validated = await authed('post', VALIDATE_PATH)
        .send({
          level: 'CATEGORY',
          quantityFormula: FLOOR_QUANTITY,
          costFormula: SYNTAX_ERROR_FORMULA,
        })
        .expect(200);

      expect(validated.body.valid).toBe(false);

      const saved = await authed('post', RULES_PATH)
        .send(buildRuleInput({ costFormula: SYNTAX_ERROR_FORMULA }))
        .expect(422);
      const issue = (saved.body.error.params.errors as FormulaIssueBody[]).find(
        (candidate) => candidate.formula === 'cost',
      );

      expect(saved.body.error.code).toBe(ERROR_CODES.FORMULA_INVALID);
      expect(issue?.code).toBe('FORMULA_SYNTAX');
      expect(typeof issue?.position).toBe('number');
    });

    it('reports an unknown coefficient by name', async () => {
      const response = await authed('post', RULES_PATH)
        .send(buildRuleInput({ costFormula: UNKNOWN_COEFFICIENT_FORMULA }))
        .expect(422);
      const issue = response.body.error.params.errors[0] as FormulaIssueBody;

      expect(response.body.error.code).toBe(ERROR_CODES.FORMULA_INVALID);
      expect(issue.code).toBe('UNKNOWN_COEFFICIENT');
      expect(JSON.stringify(issue.params)).toContain('nope');
    });

    it('accepts a valid formula and lists the coefficients it uses', async () => {
      const response = await authed('post', VALIDATE_PATH)
        .send({
          level: 'MATERIAL_TYPE',
          quantityFormula: FLOOR_QUANTITY,
          costFormula: 'quantity * (price + coef.laminate_underlay)',
        })
        .expect(200);

      expect(response.body).toEqual({
        valid: true,
        coefficientKeys: ['laminate_underlay'],
        errors: [],
      });
    });

    it('answers 400 for a malformed validate body', async () => {
      const response = await authed('post', VALIDATE_PATH)
        .send({ level: 'CATEGORY' })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });
  });

  describe('rule shape in validate and preview', () => {
    it('rejects validate for a category rule without a quantity formula', async () => {
      const response = await authed('post', VALIDATE_PATH)
        .send({ level: 'CATEGORY', costFormula: 'quantity * price' })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('rejects validate for an object rule with a quantity formula', async () => {
      const response = await authed('post', VALIDATE_PATH)
        .send({
          level: 'OBJECT',
          quantityFormula: FLOOR_QUANTITY,
          costFormula: 'totalArea',
        })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('rejects preview for an object rule with a quantity formula', async () => {
      const response = await authed('post', `${RULES_PATH}/preview`)
        .send({
          level: 'OBJECT',
          quantityFormula: FLOOR_QUANTITY,
          costFormula: 'totalArea',
          sample: livingRoomSample,
        })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('creates an object rule with explicit null references', async () => {
      const created = await authed('post', RULES_PATH)
        .send({
          level: 'OBJECT',
          categoryId: null,
          materialTypeId: null,
          name: { en: 'Null refs', uk: 'Нульові посилання' },
          costFormula: 'totalArea',
        })
        .expect(201);

      expect(created.body.categoryId).toBeNull();

      await authed('delete', `${RULES_PATH}/${created.body.id}`).expect(204);
    });
  });

  describe('preview', () => {
    it('computes the living-room example without saving anything', async () => {
      const before = await listRules();
      const response = await authed('post', `${RULES_PATH}/preview`)
        .send({
          level: 'MATERIAL_TYPE',
          quantityFormula: FLOOR_QUANTITY,
          costFormula: 'quantity * (price + coef.laminate_underlay)',
          sample: livingRoomSample,
        })
        .expect(200);

      expect(response.body.quantity).toBe(21);
      expect(response.body.amountCents).toBe(42_000);
      expect(response.body.error).toBeNull();
      expect(response.body.coefficients).toEqual({ laminate_underlay: 2 });
      expect(response.body.variables).toMatchObject({
        floorArea: 20,
        waste: 0.05,
        price: 18,
      });

      expect(await listRules()).toEqual(before);
    });

    it('rejects an invalid formula with FORMULA_INVALID', async () => {
      const response = await authed('post', `${RULES_PATH}/preview`)
        .send({
          level: 'CATEGORY',
          quantityFormula: UNKNOWN_VARIABLE_FORMULA,
          costFormula: 'quantity * price',
          sample: livingRoomSample,
        })
        .expect(422);

      expect(response.body.error.code).toBe(ERROR_CODES.FORMULA_INVALID);
      expect(response.body.error.params.errors[0].code).toBe(
        'UNKNOWN_VARIABLE',
      );
    });
  });

  describe('rule creation errors', () => {
    it('rejects a rule on a non-existent category', async () => {
      const missingId = randomUUID();
      const response = await authed('post', RULES_PATH)
        .send(buildRuleInput({ categoryId: missingId }))
        .expect(422);

      expect(response.body.error.code).toBe(ERROR_CODES.UNKNOWN_REFERENCE);
      expect(response.body.error.params.references).toEqual([
        { field: 'categoryId', id: missingId },
      ]);
    });

    it('rejects a duplicate category rule', async () => {
      const response = await authed('post', RULES_PATH)
        .send(buildRuleInput({ categoryId: categoryIds.floorCovering }))
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.RULE_EXISTS);
    });
  });

  describe('rule precedence and cache invalidation', () => {
    it('applies a material-type rule over the category rule', async () => {
      const before = await estimateLines();
      const vinylBefore = lineOf(before, productIds.greySpcVinylPlank);

      expect(vinylBefore.ruleId).toBe(ruleIds.floorCovering);

      const created = await authed('post', RULES_PATH)
        .send(
          buildRuleInput({
            level: 'MATERIAL_TYPE',
            categoryId: categoryIds.floorCovering,
            materialTypeId: materialTypeIds.vinyl,
            costFormula: VINYL_COST_FORMULA,
          }),
        )
        .expect(201);
      const lines = await estimateLines();
      const vinyl = lineOf(lines, productIds.greySpcVinylPlank);

      expect(vinyl.ruleId).toBe(created.body.id);
      expect(vinyl.amountCents).not.toBe(vinylBefore.amountCents);
      expect(lineOf(lines, productIds.whiteOakParquetPlank).ruleId).toBe(
        ruleIds.floorCovering,
      );
      expect(lineOf(lines, productIds.lightLaminateFlooring).ruleId).toBe(
        ruleIds.laminateFloor,
      );
    });

    it('reflects an updated formula in estimates and the pricing version', async () => {
      const before = await estimateLines();
      const versionBefore = await request(testApp.http)
        .get(PRICING_DATA_PATH)
        .expect(200);
      const rule = await findRule(ruleIds.floorCovering);

      const updated = await authed('patch', `${RULES_PATH}/${rule.id}`)
        .send({ costFormula: DOUBLED_COST_FORMULA, revision: rule.revision })
        .expect(200);

      expect(updated.body.costFormula).toBe(DOUBLED_COST_FORMULA);

      const after = await estimateLines();
      const versionAfter = await request(testApp.http)
        .get(PRICING_DATA_PATH)
        .expect(200);

      expect(lineOf(after, productIds.whiteOakParquetPlank).amountCents).toBe(
        lineOf(before, productIds.whiteOakParquetPlank).amountCents * 2,
      );
      expect(versionAfter.headers.etag).not.toBe(versionBefore.headers.etag);
      expect(versionAfter.body.version).not.toBe(versionBefore.body.version);
    });

    it('rejects an update with a stale revision', async () => {
      const response = await authed(
        'patch',
        `${RULES_PATH}/${ruleIds.floorCovering}`,
      )
        .send({ costFormula: 'quantity * price', revision: randomUUID() })
        .expect(409);

      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
    });
  });

  describe('categories without a rule', () => {
    it('lists a category once its rule is removed', async () => {
      const before = await listRules();

      expect(before.categoriesWithoutRule).toEqual([]);

      await authed('delete', `${RULES_PATH}/${ruleIds.ceilingFinish}`).expect(
        204,
      );

      const after = await listRules();

      expect(
        after.categoriesWithoutRule.map((category) => category.id),
      ).toEqual([categoryIds.ceilingFinish]);
    });

    it('answers 404 when the same rule is deleted twice', async () => {
      const response = await authed(
        'delete',
        `${RULES_PATH}/${ruleIds.ceilingFinish}`,
      ).expect(404);

      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('stops listing the category after a rule is created for it', async () => {
      await authed('post', RULES_PATH).send(buildRuleInput()).expect(201);

      expect((await listRules()).categoriesWithoutRule).toEqual([]);
    });
  });

  describe('object rule ordering', () => {
    it('creates object rules and reorders them', async () => {
      const first = await authed('post', RULES_PATH)
        .send({
          level: 'OBJECT',
          name: { en: 'Extra one', uk: 'Додаткове один' },
          costFormula: 'totalArea',
        })
        .expect(201);
      const second = await authed('post', RULES_PATH)
        .send({
          level: 'OBJECT',
          name: { en: 'Extra two', uk: 'Додаткове два' },
          costFormula: 'totalArea * 2',
        })
        .expect(201);
      const objectIds = (await listRules()).items
        .filter((item) => item.level === 'OBJECT')
        .map((item) => item.id);

      expect(objectIds).toEqual([
        ruleIds.balconyTile,
        first.body.id,
        second.body.id,
      ]);

      const reversed = [...objectIds].reverse();

      await authed('put', `${RULES_PATH}/order`)
        .send({ ids: reversed })
        .expect(204);

      const reordered = (await listRules()).items
        .filter((item) => item.level === 'OBJECT')
        .map((item) => item.id);

      expect(reordered).toEqual(reversed);

      const rules = (await listRules()).items.filter(
        (item) => item.level === 'OBJECT',
      );

      for (const rule of rules) {
        expect(rule.updatedBy?.id).toBe(adminId);
      }
    });

    it('rejects an order that misses an object rule', async () => {
      const response = await authed('put', `${RULES_PATH}/order`)
        .send({ ids: [ruleIds.balconyTile] })
        .expect(400);

      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });
  });
});
