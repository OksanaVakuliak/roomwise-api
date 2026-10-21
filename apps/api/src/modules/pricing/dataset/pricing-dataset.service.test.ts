import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client';
import { RateSource, RuleLevel } from '../../../generated/prisma/enums';
import { pricingDataset } from './data';
import {
  buildPricingDatasetRows,
  PricingDatasetService,
} from './pricing-dataset.service';

const MODELS = [
  'pricingSettings',
  'baseRate',
  'coefficient',
  'pricingRule',
  'exchangeRate',
] as const;

const OPERATIONS = [
  'upsert',
  'update',
  'create',
  'createMany',
  'deleteMany',
  'updateMany',
  'findFirst',
] as const;

interface RecordedCall {
  model: string;
  operation: string;
  args: unknown;
}

function createTx(existingRules: Array<{ id: string }> = []) {
  const calls: RecordedCall[] = [];
  const tx: Record<string, Record<string, unknown>> = {};

  for (const model of MODELS) {
    tx[model] = {};
    for (const operation of OPERATIONS) {
      tx[model][operation] = vi.fn(async (args: unknown) => {
        calls.push({ model, operation, args });
        if (model === 'pricingRule' && operation === 'findFirst') {
          return existingRules.shift() ?? null;
        }
        return { count: 0 };
      });
    }
  }

  const steps = () => calls.map((call) => `${call.model}.${call.operation}`);
  const argsOf = (model: string, operation: string) =>
    calls
      .filter((call) => call.model === model && call.operation === operation)
      .map((call) => call.args);

  return { tx: tx as unknown as Prisma.TransactionClient, steps, argsOf };
}

describe('buildPricingDatasetRows', () => {
  it('flattens the limits into the settings row', () => {
    expect(buildPricingDatasetRows(pricingDataset).limits).toEqual({
      id: 1,
      totalAreaMinSqm: 15,
      totalAreaMaxSqm: 500,
      roomsMin: 1,
      roomsMax: 15,
      roomSideMinM: 1,
      roomSideMaxM: 30,
      roomHeightMinM: 2.2,
      roomHeightMaxM: 5,
    });
  });
});

describe('PricingDatasetService.upsert', () => {
  it('upserts the settings limits without touching exchange rate state', async () => {
    const { tx, argsOf } = createTx();

    await new PricingDatasetService().upsert(pricingDataset, tx);

    const [call] = argsOf('pricingSettings', 'upsert') as Array<{
      where: { id: number };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }>;
    expect(call.where).toEqual({ id: 1 });
    expect(call.create.id).toBe(1);
    expect(call.update).not.toHaveProperty('id');
    expect(call.update).not.toHaveProperty('manualRateId');
    expect(call.update.totalAreaMaxSqm).toBe(500);
  });

  it('upserts base rates by finish level and range start', async () => {
    const { tx, argsOf } = createTx();

    await new PricingDatasetService().upsert(pricingDataset, tx);

    const calls = argsOf('baseRate', 'upsert') as Array<{
      where: {
        finishLevel_areaFromSqm: { finishLevel: string; areaFromSqm: number };
      };
      update: { updatedById: null; revision: string };
    }>;
    expect(calls).toHaveLength(pricingDataset.baseRates.length);
    pricingDataset.baseRates.forEach((rate, index) => {
      expect(calls[index].where.finishLevel_areaFromSqm).toEqual({
        finishLevel: rate.finishLevel,
        areaFromSqm: rate.areaFromSqm,
      });
      expect(calls[index].update.updatedById).toBeNull();
      expect(calls[index].update.revision).toEqual(expect.any(String));
    });
  });

  it('upserts coefficients by key with a fresh revision', async () => {
    const { tx, argsOf } = createTx();

    await new PricingDatasetService().upsert(pricingDataset, tx);

    const calls = argsOf('coefficient', 'upsert') as Array<{
      where: { key: string };
      update: { updatedById: null; revision: string };
    }>;
    expect(calls.map((call) => call.where.key)).toEqual(
      pricingDataset.coefficients.map((coefficient) => coefficient.key),
    );
    for (const call of calls) {
      expect(call.update.updatedById).toBeNull();
    }
  });

  it('creates every rule when none exists', async () => {
    const { tx, argsOf } = createTx();

    await new PricingDatasetService().upsert(pricingDataset, tx);

    const created = argsOf('pricingRule', 'create') as Array<{
      data: { id: string };
    }>;
    expect(created.map((call) => call.data.id)).toEqual(
      pricingDataset.rules.map((rule) => rule.id),
    );
    expect(argsOf('pricingRule', 'update')).toHaveLength(0);
  });

  it('looks up category and material type rules by their target', async () => {
    const { tx, argsOf } = createTx();

    await new PricingDatasetService().upsert(pricingDataset, tx);

    const lookups = argsOf('pricingRule', 'findFirst') as Array<{
      where: Record<string, unknown>;
    }>;
    pricingDataset.rules.forEach((rule, index) => {
      expect(lookups[index].where).toEqual(
        rule.level === RuleLevel.OBJECT
          ? { id: rule.id }
          : {
              level: rule.level,
              categoryId: rule.categoryId,
              materialTypeId: rule.materialTypeId,
            },
      );
    });
  });

  it('updates an existing rule in place and keeps its id', async () => {
    const existingId = '99999999-9999-4999-8999-999999999999';
    const { tx, argsOf } = createTx([{ id: existingId }]);

    await new PricingDatasetService().upsert(pricingDataset, tx);

    const [update] = argsOf('pricingRule', 'update') as Array<{
      where: { id: string };
      data: Record<string, unknown>;
    }>;
    expect(update.where).toEqual({ id: existingId });
    expect(update.data).not.toHaveProperty('id');
    expect(update.data.updatedById).toBeNull();
    expect(argsOf('pricingRule', 'create')).toHaveLength(
      pricingDataset.rules.length - 1,
    );
  });

  it('never deletes anything', async () => {
    const { tx, steps } = createTx();

    await new PricingDatasetService().upsert(pricingDataset, tx);

    expect(steps().filter((step) => step.endsWith('deleteMany'))).toEqual([]);
  });
});

describe('PricingDatasetService.replace', () => {
  it('detaches and removes manual rates but keeps official ones', async () => {
    const { tx, steps, argsOf } = createTx();

    await new PricingDatasetService().replace(pricingDataset, tx);

    expect(argsOf('pricingSettings', 'updateMany')).toEqual([
      { data: { manualRateId: null } },
    ]);
    expect(argsOf('exchangeRate', 'deleteMany')).toEqual([
      { where: { source: RateSource.MANUAL } },
    ]);
    expect(steps().indexOf('pricingSettings.updateMany')).toBeLessThan(
      steps().indexOf('exchangeRate.deleteMany'),
    );
  });

  it('clears rates, coefficients and rules, then inserts the dataset', async () => {
    const { tx, steps, argsOf } = createTx();

    await new PricingDatasetService().replace(pricingDataset, tx);

    for (const model of ['pricingRule', 'coefficient', 'baseRate']) {
      expect(argsOf(model, 'deleteMany')).toEqual([{}]);
    }
    expect(steps().lastIndexOf('baseRate.deleteMany')).toBeLessThan(
      steps().indexOf('baseRate.createMany'),
    );
    expect(argsOf('baseRate', 'createMany')).toEqual([
      { data: buildPricingDatasetRows(pricingDataset).baseRates },
    ]);
    expect(argsOf('coefficient', 'createMany')).toHaveLength(1);
    expect(argsOf('pricingRule', 'createMany')).toEqual([
      { data: buildPricingDatasetRows(pricingDataset).rules },
    ]);
  });

  it('restores the limits', async () => {
    const { tx, argsOf } = createTx();

    await new PricingDatasetService().replace(pricingDataset, tx);

    expect(argsOf('pricingSettings', 'upsert')).toHaveLength(1);
  });
});
