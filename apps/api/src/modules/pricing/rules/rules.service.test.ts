import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { RuleLevel } from '../../../generated/prisma/enums';
import type { CatalogPricingReadService } from '../../catalog/pricing-read/catalog-pricing-read.service';
import type { PricingDataService } from '../pricing-data/pricing-data.service';
import { RulesService } from './rules.service';

const ADMIN_ID = 'admin-1';
const RULE_ID = 'rule-1';
const CATEGORY_ID = 'category-1';
const MATERIAL_TYPE_ID = 'material-type-1';
const CURRENT_REVISION = 'revision-1';
const QUANTITY = 'floorArea * (1 + waste)';
const COST = 'quantity * (price + coef.tile_glue)';

function localized(en: string, uk: string) {
  return { en, uk };
}

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    level: RuleLevel.CATEGORY,
    categoryId: CATEGORY_ID,
    materialTypeId: null,
    surface: null,
    baseComponent: false,
    name: localized('Floor', 'Підлога'),
    quantityFormula: QUANTITY,
    costFormula: COST,
    laborFormula: null,
    coefficientKeys: ['tile_glue'],
    sortOrder: 0,
    revision: CURRENT_REVISION,
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    ...overrides,
  };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function p2025() {
  return new Prisma.PrismaClientKnownRequestError('missing', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

function setup(
  options: {
    rule?: Record<string, unknown>;
    categories?: string[];
    materialTypes?: string[];
  } = {},
) {
  const rule = {
    findMany: vi.fn().mockResolvedValue([ruleRow()]),
    findUnique: vi.fn().mockResolvedValue(ruleRow()),
    findFirst: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 2 } }),
    create: vi.fn().mockResolvedValue(ruleRow()),
    update: vi.fn().mockImplementation((args: unknown) => args),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue(ruleRow()),
    ...options.rule,
  };
  const queryRaw = vi
    .fn()
    .mockImplementation((_sql: TemplateStringsArray, keys: string[]) =>
      Promise.resolve(keys.map((key) => ({ key, value: 1 }))),
    );
  const prisma = {
    pricingRule: rule,
    $queryRaw: queryRaw,
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? arg(prisma) : Promise.resolve([]),
  );
  const catalog = {
    existingCategoryIds: vi
      .fn()
      .mockResolvedValue(new Set(options.categories ?? [CATEGORY_ID])),
    existingMaterialTypeIds: vi
      .fn()
      .mockResolvedValue(new Set(options.materialTypes ?? [MATERIAL_TYPE_ID])),
    categorySummaries: vi.fn().mockResolvedValue([
      { id: CATEGORY_ID, name: localized('Floor', 'Підлога') },
      { id: 'category-2', name: localized('Walls', 'Стіни') },
    ]),
  };
  const pricingData = {
    invalidate: vi.fn(),
    coefficients: vi.fn().mockResolvedValue({ tile_glue: 1 }),
  };
  const service = new RulesService(
    prisma as unknown as PrismaService,
    catalog as unknown as CatalogPricingReadService,
    pricingData as unknown as PricingDataService,
  );

  return { service, prisma, rule, catalog, pricingData, queryRaw };
}

const categoryInput = {
  level: RuleLevel.CATEGORY,
  baseComponent: false,
  categoryId: CATEGORY_ID,
  name: localized('Floor', 'Підлога'),
  quantityFormula: QUANTITY,
  costFormula: COST,
};

describe('RulesService.list', () => {
  it('orders object rules by sort order before the others', async () => {
    const { service, rule } = setup();
    rule.findMany.mockResolvedValue([
      ruleRow({ id: 'c', level: RuleLevel.CATEGORY }),
      ruleRow({
        id: 'o2',
        level: RuleLevel.OBJECT,
        categoryId: null,
        quantityFormula: null,
        sortOrder: 1,
      }),
      ruleRow({
        id: 'o1',
        level: RuleLevel.OBJECT,
        categoryId: null,
        quantityFormula: null,
        sortOrder: 0,
      }),
    ]);

    const result = await service.list();

    expect(result.items.map((item) => item.id)).toEqual(['o1', 'o2', 'c']);
  });

  it('maps rows to the admin shape', async () => {
    const { service } = setup();

    const result = await service.list();

    expect(result.items).toEqual([
      {
        id: RULE_ID,
        level: RuleLevel.CATEGORY,
        categoryId: CATEGORY_ID,
        materialTypeId: null,
        surface: null,
        baseComponent: false,
        name: localized('Floor', 'Підлога'),
        quantityFormula: QUANTITY,
        costFormula: COST,
        laborFormula: null,
        coefficientKeys: ['tile_glue'],
        sortOrder: 0,
        orphaned: false,
        revision: CURRENT_REVISION,
        updatedAt: '2026-10-01T12:00:00.000Z',
        updatedBy: { id: ADMIN_ID, login: 'admin' },
      },
    ]);
  });

  it('flags rules whose category or material type is gone', async () => {
    const { service, rule, catalog } = setup({
      categories: [CATEGORY_ID],
      materialTypes: [],
    });
    rule.findMany.mockResolvedValue([
      ruleRow({ id: 'gone-category', categoryId: 'category-9' }),
      ruleRow({
        id: 'gone-material',
        level: RuleLevel.MATERIAL_TYPE,
        materialTypeId: MATERIAL_TYPE_ID,
      }),
      ruleRow({ id: 'fine' }),
    ]);

    const result = await service.list();

    expect(
      Object.fromEntries(result.items.map((item) => [item.id, item.orphaned])),
    ).toEqual({ 'gone-category': true, 'gone-material': true, fine: false });
    expect(catalog.existingCategoryIds).toHaveBeenCalledTimes(1);
    expect(catalog.existingMaterialTypeIds).toHaveBeenCalledTimes(1);
  });

  it('lists categories without a live category rule', async () => {
    const { service } = setup();

    const result = await service.list();

    expect(result.categoriesWithoutRule).toEqual([
      { id: 'category-2', name: localized('Walls', 'Стіни') },
    ]);
  });

  it('does not count an orphaned category rule as coverage', async () => {
    const { service } = setup({ categories: ['category-2'] });

    const result = await service.list();

    expect(result.categoriesWithoutRule.map((category) => category.id)).toEqual(
      [CATEGORY_ID, 'category-2'],
    );
  });
});

describe('RulesService.create', () => {
  it('stores sorted unique coefficient keys from both formulas', async () => {
    const { service, rule, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({
      tile_glue: 1,
      laminate_underlay: 2,
    });

    await service.create(
      {
        ...categoryInput,
        quantityFormula: 'floorArea * (1 + waste) + coef.tile_glue',
        costFormula:
          'quantity * (price + coef.laminate_underlay + coef.tile_glue)',
      },
      ADMIN_ID,
    );

    expect(rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coefficientKeys: ['laminate_underlay', 'tile_glue'],
          updatedById: ADMIN_ID,
          sortOrder: 0,
        }),
      }),
    );
  });

  it('rejects the rule when a coefficient disappears before the write', async () => {
    const { service, rule, queryRaw } = setup();
    queryRaw.mockResolvedValue([]);

    await expect(
      service.create(
        {
          ...categoryInput,
          costFormula: 'quantity * price * coef.tile_glue',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORMULA_INVALID });
    expect(rule.create).not.toHaveBeenCalled();
  });

  it('skips the coefficient lock when the formulas use none', async () => {
    const { service, queryRaw } = setup();

    await service.create(
      { ...categoryInput, costFormula: 'quantity * price' },
      ADMIN_ID,
    );

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('appends an object rule after the highest sort order', async () => {
    const { service, rule } = setup();

    await service.create(
      {
        level: RuleLevel.OBJECT,
        baseComponent: false,
        name: localized('Balcony', 'Балкон'),
        costFormula: 'balconyTiles ? balconyArea * coef.tile_glue : 0',
      },
      ADMIN_ID,
    );

    expect(rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: null,
          quantityFormula: null,
          sortOrder: 3,
        }),
      }),
    );
  });

  it('starts object sort order at zero when there are none', async () => {
    const { service, rule } = setup();
    rule.aggregate.mockResolvedValue({ _max: { sortOrder: null } });

    await service.create(
      {
        level: RuleLevel.OBJECT,
        baseComponent: false,
        name: localized('Balcony', 'Балкон'),
        costFormula: '1',
      },
      ADMIN_ID,
    );

    expect(rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 0 }),
      }),
    );
  });

  it('returns the created rule and invalidates the pricing data', async () => {
    const { service, pricingData } = setup();

    const result = await service.create(categoryInput, ADMIN_ID);

    expect(result.id).toBe(RULE_ID);
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid formula with its tag and does not invalidate', async () => {
    const { service, rule, pricingData } = setup();

    const error = await service
      .create(
        { ...categoryInput, costFormula: 'quantity * coef.missing' },
        ADMIN_ID,
      )
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: ERROR_CODES.FORMULA_INVALID,
      params: {
        errors: [
          expect.objectContaining({
            formula: 'cost',
            code: 'UNKNOWN_COEFFICIENT',
          }),
        ],
      },
    });
    expect(rule.create).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('tags quantity formula errors as quantity', async () => {
    const { service } = setup();

    await expect(
      service.create({ ...categoryInput, quantityFormula: '1 +' }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FORMULA_INVALID,
      params: {
        errors: [expect.objectContaining({ formula: 'quantity' })],
      },
    });
  });

  it('rejects a missing category', async () => {
    const { service, rule, pricingData } = setup({ categories: [] });

    await expect(service.create(categoryInput, ADMIN_ID)).rejects.toMatchObject(
      {
        code: ERROR_CODES.UNKNOWN_REFERENCE,
        params: {
          references: [{ field: 'categoryId', id: CATEGORY_ID }],
        },
      },
    );
    expect(rule.create).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('names every missing reference of a material type rule', async () => {
    const { service } = setup({ categories: [], materialTypes: [] });

    await expect(
      service.create(
        {
          ...categoryInput,
          level: RuleLevel.MATERIAL_TYPE,
          materialTypeId: MATERIAL_TYPE_ID,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN_REFERENCE,
      params: {
        references: [
          { field: 'categoryId', id: CATEGORY_ID },
          { field: 'materialTypeId', id: MATERIAL_TYPE_ID },
        ],
      },
    });
  });

  it('stores sorted coefficient keys referenced by the labor formula', async () => {
    const { service, rule, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({
      tile_glue: 1,
      labor_tile: 2,
    });

    await service.create(
      {
        ...categoryInput,
        laborFormula: 'quantity * coef.labor_tile',
      },
      ADMIN_ID,
    );

    expect(rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          laborFormula: 'quantity * coef.labor_tile',
          coefficientKeys: ['labor_tile', 'tile_glue'],
        }),
      }),
    );
  });

  it('tags labor formula errors as labor', async () => {
    const { service, rule } = setup();

    await expect(
      service.create(
        { ...categoryInput, laborFormula: 'quantity * coef.missing' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FORMULA_INVALID,
      params: {
        errors: [
          expect.objectContaining({
            formula: 'labor',
            code: 'UNKNOWN_COEFFICIENT',
          }),
        ],
      },
    });
    expect(rule.create).not.toHaveBeenCalled();
  });

  it('creates a surface rule with its surface and no references', async () => {
    const { service, rule, catalog } = setup();

    await service.create(
      {
        level: RuleLevel.SURFACE,
        surface: 'FLOOR',
        baseComponent: false,
        name: localized('Floor surface', 'Поверхня підлоги'),
        costFormula: 'surfaceArea * coef.tile_glue',
      },
      ADMIN_ID,
    );

    expect(catalog.existingCategoryIds).toHaveBeenCalledWith([]);
    expect(rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: RuleLevel.SURFACE,
          surface: 'FLOOR',
          categoryId: null,
          quantityFormula: null,
          laborFormula: null,
          sortOrder: 0,
        }),
      }),
    );
  });

  it('stores the base component flag of an object rule', async () => {
    const { service, rule } = setup();

    await service.create(
      {
        level: RuleLevel.OBJECT,
        baseComponent: true,
        name: localized('Base', 'База'),
        costFormula: 'totalArea * coef.tile_glue',
      },
      ADMIN_ID,
    );

    expect(rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ baseComponent: true }),
      }),
    );
  });

  it('rejects a duplicate surface rule found by the pre-check', async () => {
    const { service, rule, pricingData } = setup();
    rule.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      service.create(
        {
          level: RuleLevel.SURFACE,
          surface: 'WALLS',
          baseComponent: false,
          name: localized('Walls', 'Стіни'),
          costFormula: 'surfaceArea',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.RULE_EXISTS });
    expect(rule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { level: RuleLevel.SURFACE, surface: 'WALLS' },
      }),
    );
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('maps a surface unique violation from a race to RULE_EXISTS', async () => {
    const { service, rule } = setup();
    rule.create.mockRejectedValue(p2002());

    await expect(
      service.create(
        {
          level: RuleLevel.SURFACE,
          surface: 'CEILING',
          baseComponent: false,
          name: localized('Ceiling', 'Стеля'),
          costFormula: 'surfaceArea',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.RULE_EXISTS,
      params: expect.objectContaining({ surface: 'CEILING' }),
    });
  });

  it('rejects a duplicate category rule found by the pre-check', async () => {
    const { service, rule, pricingData } = setup();
    rule.findFirst.mockResolvedValue({ id: 'other' });

    await expect(service.create(categoryInput, ADMIN_ID)).rejects.toMatchObject(
      { code: ERROR_CODES.RULE_EXISTS },
    );
    expect(rule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          level: RuleLevel.CATEGORY,
          categoryId: CATEGORY_ID,
          materialTypeId: null,
        },
      }),
    );
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('maps a unique violation from a race to RULE_EXISTS', async () => {
    const { service, rule, pricingData } = setup();
    rule.create.mockRejectedValue(p2002());

    await expect(service.create(categoryInput, ADMIN_ID)).rejects.toMatchObject(
      { code: ERROR_CODES.RULE_EXISTS },
    );
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('rethrows other database errors', async () => {
    const { service, rule } = setup();
    const failure = new Error('boom');
    rule.create.mockRejectedValue(failure);

    await expect(service.create(categoryInput, ADMIN_ID)).rejects.toBe(failure);
  });
});

describe('RulesService.update', () => {
  it('re-validates merged formulas and recomputes coefficient keys', async () => {
    const { service, rule, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({
      tile_glue: 1,
      laminate_underlay: 2,
    });

    await service.update(
      RULE_ID,
      {
        costFormula: 'quantity * (price + coef.laminate_underlay)',
        revision: CURRENT_REVISION,
      },
      ADMIN_ID,
    );

    expect(rule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RULE_ID, revision: CURRENT_REVISION },
        data: expect.objectContaining({
          quantityFormula: QUANTITY,
          costFormula: 'quantity * (price + coef.laminate_underlay)',
          coefficientKeys: ['laminate_underlay'],
          updatedById: ADMIN_ID,
          revision: expect.not.stringMatching(CURRENT_REVISION),
        }),
      }),
    );
  });

  it('validates the stored formula against a patched one', async () => {
    const { service, rule, pricingData } = setup();

    await expect(
      service.update(
        RULE_ID,
        { quantityFormula: 'nope', revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FORMULA_INVALID,
      params: { errors: [expect.objectContaining({ formula: 'quantity' })] },
    });
    expect(rule.updateMany).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('rejects a quantity formula on an object rule', async () => {
    const { service, rule } = setup();
    rule.findUnique.mockResolvedValue(
      ruleRow({
        level: RuleLevel.OBJECT,
        categoryId: null,
        quantityFormula: null,
      }),
    );

    await expect(
      service.update(
        RULE_ID,
        { quantityFormula: '1', revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects clearing the quantity formula of a category rule', async () => {
    const { service } = setup();

    await expect(
      service.update(
        RULE_ID,
        { quantityFormula: null, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('stores a patched labor formula with its coefficient keys', async () => {
    const { service, rule, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({
      tile_glue: 1,
      labor_tile: 2,
    });

    await service.update(
      RULE_ID,
      {
        laborFormula: 'quantity * coef.labor_tile',
        revision: CURRENT_REVISION,
      },
      ADMIN_ID,
    );

    expect(rule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          laborFormula: 'quantity * coef.labor_tile',
          coefficientKeys: ['labor_tile', 'tile_glue'],
        }),
      }),
    );
  });

  it('clears the labor formula with null', async () => {
    const { service, rule } = setup();
    rule.findUnique.mockResolvedValue(
      ruleRow({ laborFormula: 'quantity * 2' }),
    );

    await service.update(
      RULE_ID,
      { laborFormula: null, revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(rule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ laborFormula: null }),
      }),
    );
  });

  it('rejects a labor formula on an object rule', async () => {
    const { service, rule } = setup();
    rule.findUnique.mockResolvedValue(
      ruleRow({
        level: RuleLevel.OBJECT,
        categoryId: null,
        quantityFormula: null,
      }),
    );

    await expect(
      service.update(
        RULE_ID,
        { laborFormula: '1', revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects a labor formula on a surface rule', async () => {
    const { service, rule } = setup();
    rule.findUnique.mockResolvedValue(
      ruleRow({
        level: RuleLevel.SURFACE,
        surface: 'FLOOR',
        categoryId: null,
        quantityFormula: null,
      }),
    );

    await expect(
      service.update(
        RULE_ID,
        { laborFormula: '1', revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects the base component flag on a category rule', async () => {
    const { service } = setup();

    await expect(
      service.update(
        RULE_ID,
        { baseComponent: true, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('throws NOT_FOUND for an unknown rule', async () => {
    const { service, rule, pricingData } = setup();
    rule.findUnique.mockResolvedValue(null);

    await expect(
      service.update(RULE_ID, { revision: CURRENT_REVISION }, ADMIN_ID),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('throws STALE_REVISION with the current revision', async () => {
    const { service, rule, pricingData } = setup();
    rule.updateMany.mockResolvedValue({ count: 0 });
    rule.findUnique
      .mockResolvedValueOnce(ruleRow())
      .mockResolvedValueOnce({ revision: 'revision-2' });

    await expect(
      service.update(RULE_ID, { revision: 'old' }, ADMIN_ID),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: 'revision-2' },
    });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('invalidates the pricing data after a successful update', async () => {
    const { service, pricingData } = setup();

    const result = await service.update(
      RULE_ID,
      { name: localized('New', 'Нова'), revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(result.id).toBe(RULE_ID);
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe('RulesService.reorder', () => {
  const objectRules = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  beforeEach(() => vi.clearAllMocks());

  it('rewrites sort order in one transaction and invalidates', async () => {
    const { service, rule, prisma, pricingData } = setup();
    rule.findMany.mockResolvedValue(objectRules);

    await service.reorder({ ids: ['c', 'a', 'b'] }, ADMIN_ID);

    expect(rule.update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: {
        sortOrder: 0,
        updatedAt: expect.any(Date),
        updatedById: ADMIN_ID,
      },
    });
    expect(rule.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: {
        sortOrder: 2,
        updatedAt: expect.any(Date),
        updatedById: ADMIN_ID,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing id', ['a', 'b']],
    ['an unknown id', ['a', 'b', 'x']],
    ['a duplicate id', ['a', 'a', 'b']],
  ])('rejects %s', async (_label, ids) => {
    const { service, rule, prisma, pricingData } = setup();
    rule.findMany.mockResolvedValue(objectRules);

    await expect(service.reorder({ ids }, ADMIN_ID)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('maps a rule deleted mid-flight to VALIDATION_FAILED', async () => {
    const { service, rule, prisma, pricingData } = setup();
    rule.findMany.mockResolvedValue(objectRules);
    vi.mocked(prisma.$transaction).mockRejectedValue(p2025());

    await expect(
      service.reorder({ ids: ['a', 'b', 'c'] }, ADMIN_ID),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });
});

describe('RulesService.remove', () => {
  it('deletes the rule and invalidates', async () => {
    const { service, rule, pricingData } = setup();

    await service.remove(RULE_ID);

    expect(rule.delete).toHaveBeenCalledWith({ where: { id: RULE_ID } });
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('throws NOT_FOUND for an unknown id without invalidating', async () => {
    const { service, rule, pricingData } = setup();
    rule.delete.mockRejectedValue(p2025());

    await expect(service.remove(RULE_ID)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });
});

describe('RulesService.validate', () => {
  it('returns valid with the union of coefficient keys', async () => {
    const { service } = setup();

    const result = await service.validate({
      level: RuleLevel.CATEGORY,
      quantityFormula: QUANTITY,
      costFormula: COST,
    });

    expect(result).toEqual({
      valid: true,
      coefficientKeys: ['tile_glue'],
      errors: [],
    });
  });

  it('reports errors from both formulas with their tags', async () => {
    const { service } = setup();

    const result = await service.validate({
      level: RuleLevel.CATEGORY,
      quantityFormula: '1 +',
      costFormula: 'coef.missing',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.formula)).toEqual([
      'quantity',
      'cost',
    ]);
  });

  it('validates the labor formula with its own tag', async () => {
    const { service } = setup();

    const result = await service.validate({
      level: RuleLevel.CATEGORY,
      quantityFormula: QUANTITY,
      costFormula: COST,
      laborFormula: 'quantity * coef.missing',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.formula)).toEqual(['labor']);
  });

  it('accepts surface formulas using the surface area', async () => {
    const { service } = setup();

    const result = await service.validate({
      level: RuleLevel.SURFACE,
      costFormula: 'surfaceArea * coef.tile_glue',
    });

    expect(result).toEqual({
      valid: true,
      coefficientKeys: ['tile_glue'],
      errors: [],
    });
  });

  it('reads coefficients once', async () => {
    const { service, pricingData } = setup();

    await service.validate({
      level: RuleLevel.CATEGORY,
      quantityFormula: QUANTITY,
      costFormula: COST,
    });

    expect(pricingData.coefficients).toHaveBeenCalledTimes(1);
  });
});

const FULL_OBJECT = {
  scope: 'FULL' as const,
  totalAreaSqm: 60,
  balconyAreaSqm: 0,
  balconyTiles: false,
  finishLevel: 'ROUGH' as const,
  roomsCount: 2,
  bathroomsCount: 1,
  roomsFloorArea: 50,
  roomsWallArea: 120,
  roomsPerimeter: 40,
  wetRoomsCount: 1,
};

const ROOM_SAMPLE = {
  roomTypeCode: 'LIVING_ROOM' as const,
  lengthM: 5,
  widthM: 4,
  heightM: 3,
  heatedFloor: false,
};

describe('RulesService.preview', () => {
  it('reads coefficients once and passes them to the preview', async () => {
    const { service, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({ tile_glue: 10 });

    const result = await service.preview({
      level: RuleLevel.OBJECT,
      costFormula: 'coef.tile_glue',
      sample: { object: FULL_OBJECT },
    });

    expect(pricingData.coefficients).toHaveBeenCalledTimes(1);
    expect(result.coefficients).toEqual({ tile_glue: 10 });
  });

  it('computes labor cents from the labor formula', async () => {
    const { service, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({ labor_tile: 3 });

    const result = await service.preview({
      level: RuleLevel.CATEGORY,
      quantityFormula: 'floorArea',
      costFormula: 'quantity * 2',
      laborFormula: 'quantity * coef.labor_tile',
      sample: {
        room: ROOM_SAMPLE,
        product: { priceCents: 1000, unit: 'SQM', wastePercent: 0 },
        object: FULL_OBJECT,
      },
    });

    expect(result.error).toBeNull();
    expect(result.quantity).toBe(20);
    expect(result.laborCents).toBe(6000);
  });

  it('previews a surface rule of a partial scope', async () => {
    const { service, pricingData } = setup();
    pricingData.coefficients.mockResolvedValue({});

    const result = await service.preview({
      level: RuleLevel.SURFACE,
      costFormula: 'surfaceArea * roomsPerimeter',
      sample: {
        room: ROOM_SAMPLE,
        surfaceArea: 20,
        object: {
          ...FULL_OBJECT,
          scope: 'PARTIAL',
          totalAreaSqm: null,
        },
      },
    });

    expect(result.error).toBeNull();
    expect(result.amountCents).toBe(80000);
    expect(result.laborCents).toBeNull();
  });
});
