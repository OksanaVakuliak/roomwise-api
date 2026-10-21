import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { PricingDataService } from '../pricing-data/pricing-data.service';
import { CoefficientsService } from './coefficients.service';
import { coefficientValueSchema } from './dto/coefficient-input.schema';

const ADMIN_ID = 'admin-1';
const COEFFICIENT_ID = 'coefficient-1';
const CURRENT_REVISION = 'revision-1';
const RULE_ID = 'rule-1';

function localized(en: string, uk: string) {
  return { en, uk };
}

function coefficientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COEFFICIENT_ID,
    key: 'tile_glue',
    name: localized('Tile glue', 'Клей для плитки'),
    value: new Prisma.Decimal('4.5'),
    unit: localized('$ per sqm', '$ за м²'),
    revision: CURRENT_REVISION,
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedBy: { id: ADMIN_ID, login: 'admin' },
    ...overrides,
  };
}

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    name: localized('Floor', 'Підлога'),
    coefficientKeys: ['tile_glue'],
    ...overrides,
  };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function setup(
  options: {
    coefficient?: Record<string, unknown>;
    rule?: Record<string, unknown>;
    lockedRows?: Array<{ key: string; revision: string }>;
  } = {},
) {
  const coefficient = {
    findMany: vi.fn().mockResolvedValue([coefficientRow()]),
    findUnique: vi.fn().mockResolvedValue(coefficientRow()),
    create: vi.fn().mockResolvedValue(coefficientRow()),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue(coefficientRow()),
    ...options.coefficient,
  };
  const rule = {
    findMany: vi.fn().mockResolvedValue([]),
    ...options.rule,
  };
  const queryRaw = vi
    .fn()
    .mockResolvedValue(
      options.lockedRows ?? [{ key: 'tile_glue', revision: CURRENT_REVISION }],
    );
  const prisma = {
    coefficient,
    pricingRule: rule,
    $queryRaw: queryRaw,
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback(prisma),
  );
  const pricingData = { invalidate: vi.fn() };
  const service = new CoefficientsService(
    prisma as unknown as PrismaService,
    pricingData as unknown as PricingDataService,
  );

  return { service, prisma, coefficient, rule, queryRaw, pricingData };
}

describe('CoefficientsService.list', () => {
  it('lists coefficients with the rules that use them', async () => {
    const { service, coefficient, rule } = setup();
    coefficient.findMany.mockResolvedValue([
      coefficientRow(),
      coefficientRow({ id: 'coefficient-2', key: 'unused' }),
    ]);
    rule.findMany.mockResolvedValue([ruleRow()]);

    const result = await service.list();

    expect(result.items).toEqual([
      expect.objectContaining({
        id: COEFFICIENT_ID,
        key: 'tile_glue',
        value: 4.5,
        usedBy: [{ ruleId: RULE_ID, ruleName: localized('Floor', 'Підлога') }],
        updatedAt: '2026-10-01T12:00:00.000Z',
        updatedBy: { id: ADMIN_ID, login: 'admin' },
      }),
      expect.objectContaining({ key: 'unused', usedBy: [] }),
    ]);
  });
});

describe('CoefficientsService.create', () => {
  const input = {
    key: 'tile_glue',
    name: localized('Tile glue', 'Клей для плитки'),
    value: 4.5,
    unit: localized('$ per sqm', '$ за м²'),
  };

  it('creates the coefficient and invalidates the pricing data', async () => {
    const { service, coefficient, pricingData } = setup();

    const result = await service.create(input, ADMIN_ID);

    expect(coefficient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ...input, updatedById: ADMIN_ID },
      }),
    );
    expect(result).toMatchObject({ key: 'tile_glue', usedBy: [] });
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('maps a duplicate key to KEY_TAKEN', async () => {
    const { service, coefficient, pricingData } = setup();
    coefficient.create.mockRejectedValue(p2002());

    await expect(service.create(input, ADMIN_ID)).rejects.toMatchObject({
      code: ERROR_CODES.KEY_TAKEN,
      params: { key: 'tile_glue' },
    });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });
});

describe('CoefficientsService.update', () => {
  it('changes the value of a coefficient that is in use', async () => {
    const { service, coefficient, rule, pricingData } = setup();
    rule.findMany.mockResolvedValue([ruleRow()]);

    await service.update(
      COEFFICIENT_ID,
      { value: 6, revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(coefficient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COEFFICIENT_ID, revision: CURRENT_REVISION },
        data: expect.objectContaining({
          value: 6,
          updatedById: ADMIN_ID,
          revision: expect.not.stringMatching(CURRENT_REVISION),
        }),
      }),
    );
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not check usage when the key is unchanged', async () => {
    const { service, rule } = setup();
    rule.findMany.mockResolvedValue([ruleRow()]);

    await service.update(
      COEFFICIENT_ID,
      { key: 'tile_glue', revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(rule.findMany).toHaveBeenCalledTimes(1);
    expect(rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { coefficientKeys: { has: 'tile_glue' } },
      }),
    );
  });

  it('reports a stale revision before checking usage', async () => {
    const { service, coefficient, rule } = setup();
    rule.findMany.mockResolvedValue([ruleRow()]);

    await expect(
      service.update(
        COEFFICIENT_ID,
        { key: 'glue', revision: 'old' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: CURRENT_REVISION },
    });
    expect(rule.findMany).not.toHaveBeenCalled();
    expect(coefficient.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a value finer than the stored precision', () => {
    expect(coefficientValueSchema.safeParse(1.2345).success).toBe(true);
    expect(coefficientValueSchema.safeParse(1.23456).success).toBe(false);
  });

  it('rejects renaming a key used by rules', async () => {
    const { service, coefficient, rule, pricingData } = setup();
    rule.findMany.mockResolvedValue([ruleRow()]);

    await expect(
      service.update(
        COEFFICIENT_ID,
        { key: 'glue', revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.COEFFICIENT_IN_USE,
      params: {
        rules: [{ ruleId: RULE_ID, ruleName: localized('Floor', 'Підлога') }],
      },
    });
    expect(coefficient.updateMany).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('renames an unused key', async () => {
    const { service, coefficient } = setup();

    await service.update(
      COEFFICIENT_ID,
      { key: 'glue', revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(coefficient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: 'glue' }),
      }),
    );
  });

  it('locks the coefficient row inside the transaction', async () => {
    const { service, prisma, queryRaw } = setup();

    await service.update(
      COEFFICIENT_ID,
      { value: 6, revision: CURRENT_REVISION },
      ADMIN_ID,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('maps a taken key to KEY_TAKEN', async () => {
    const { service, coefficient } = setup();
    coefficient.updateMany.mockRejectedValue(p2002());

    await expect(
      service.update(
        COEFFICIENT_ID,
        { key: 'glue', revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.KEY_TAKEN });
  });

  it('reports a stale revision with the current one', async () => {
    const { service, coefficient, pricingData } = setup();
    coefficient.updateMany.mockResolvedValue({ count: 0 });
    coefficient.findUnique.mockResolvedValue({ revision: 'revision-2' });

    await expect(
      service.update(
        COEFFICIENT_ID,
        { value: 6, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.STALE_REVISION,
      params: { currentRevision: 'revision-2' },
    });
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a missing coefficient', async () => {
    const { service, coefficient } = setup({ lockedRows: [] });

    await expect(
      service.update(
        COEFFICIENT_ID,
        { value: 6, revision: CURRENT_REVISION },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    expect(coefficient.updateMany).not.toHaveBeenCalled();
  });
});

describe('CoefficientsService.remove', () => {
  it('deletes an unused coefficient and invalidates the pricing data', async () => {
    const { service, coefficient, pricingData } = setup();

    await service.remove(COEFFICIENT_ID);

    expect(coefficient.delete).toHaveBeenCalledWith({
      where: { id: COEFFICIENT_ID },
    });
    expect(pricingData.invalidate).toHaveBeenCalledTimes(1);
  });

  it('rejects deleting a coefficient used by rules', async () => {
    const { service, coefficient, rule, pricingData } = setup();
    rule.findMany.mockResolvedValue([ruleRow()]);

    await expect(service.remove(COEFFICIENT_ID)).rejects.toMatchObject({
      code: ERROR_CODES.COEFFICIENT_IN_USE,
      params: {
        rules: [{ ruleId: RULE_ID, ruleName: localized('Floor', 'Підлога') }],
      },
    });
    expect(coefficient.delete).not.toHaveBeenCalled();
    expect(pricingData.invalidate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a missing coefficient', async () => {
    const { service, coefficient } = setup({ lockedRows: [] });

    await expect(service.remove(COEFFICIENT_ID)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(coefficient.delete).not.toHaveBeenCalled();
  });
});
