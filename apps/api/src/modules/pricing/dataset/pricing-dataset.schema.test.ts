import { validateFormula } from '@roomwise/calc-engine';
import { describe, expect, it } from 'vitest';
import { FinishLevel, RuleLevel } from '../../../generated/prisma/enums';
import { catalogDataset } from '../../catalog/dataset/data';
import { pricingDataset } from './data';
import { pricingDatasetSchema } from './pricing-dataset.schema';

function withBaseRates(baseRates: unknown[]) {
  return { ...pricingDataset, baseRates };
}

describe('pricingDataset', () => {
  it('has a category rule for every seeded category', () => {
    const ruleCategoryIds = new Set(
      pricingDataset.rules
        .filter((rule) => rule.level === RuleLevel.CATEGORY)
        .map((rule) => rule.categoryId),
    );

    expect([...ruleCategoryIds].sort()).toEqual(
      catalogDataset.categories.map((category) => category.id).sort(),
    );
  });

  it('points material type rules at seeded categories and material types', () => {
    const categoryIds = new Set(
      catalogDataset.categories.map((category) => category.id),
    );
    const materialTypeIds = new Set(
      catalogDataset.materialTypes.map((materialType) => materialType.id),
    );

    for (const rule of pricingDataset.rules) {
      if (rule.categoryId) {
        expect(categoryIds.has(rule.categoryId), rule.id).toBe(true);
      }
      if (rule.materialTypeId) {
        expect(materialTypeIds.has(rule.materialTypeId), rule.id).toBe(true);
      }
    }
  });

  it('overrides tile material types in floor and wall tile categories', () => {
    const tileCodes = ['ceramic_tile', 'porcelain_stoneware'];
    const tileIds = catalogDataset.materialTypes
      .filter((materialType) => tileCodes.includes(materialType.code))
      .map((materialType) => materialType.id);
    const tileCategoryIds = catalogDataset.categories
      .filter((category) => category.name.en.endsWith('tile'))
      .map((category) => category.id);

    for (const categoryId of tileCategoryIds) {
      for (const materialTypeId of tileIds) {
        expect(
          pricingDataset.rules.some(
            (rule) =>
              rule.level === RuleLevel.MATERIAL_TYPE &&
              rule.categoryId === categoryId &&
              rule.materialTypeId === materialTypeId,
          ),
        ).toBe(true);
      }
    }
  });

  it('defines the balcony tile rule at object level', () => {
    const objectRules = pricingDataset.rules.filter(
      (rule) => rule.level === RuleLevel.OBJECT,
    );

    expect(objectRules).toHaveLength(1);
    expect(objectRules[0].costFormula).toBe(
      'balconyTiles ? balconyArea * coef.balcony_tile : 0',
    );
  });

  it('seeds the four reference coefficients', () => {
    expect(
      Object.fromEntries(
        pricingDataset.coefficients.map(({ key, value }) => [key, value]),
      ),
    ).toEqual({
      laminate_underlay: 2,
      tile_glue: 10,
      tile_glue_heated: 21,
      balcony_tile: 75,
    });
  });

  it('seeds the input limits from the spec', () => {
    expect(pricingDataset.limits).toEqual({
      totalAreaSqm: { min: 15, max: 500 },
      rooms: { min: 1, max: 15 },
      roomSideM: { min: 1, max: 30 },
      roomHeightM: { min: 2.2, max: 5 },
    });
  });

  it('covers 15 to 500 m² for both finish levels without gaps', () => {
    for (const finishLevel of Object.values(FinishLevel)) {
      const ranges = pricingDataset.baseRates
        .filter((rate) => rate.finishLevel === finishLevel)
        .sort((a, b) => a.areaFromSqm - b.areaFromSqm);

      expect(ranges[0].areaFromSqm).toBe(15);
      expect(ranges.at(-1)?.areaToSqm).toBeGreaterThan(500);
      ranges.slice(1).forEach((range, index) => {
        expect(range.areaFromSqm).toBe(ranges[index].areaToSqm);
      });
    }
  });

  it('has formulas that are valid in the package formula language', () => {
    const coefficientKeys = pricingDataset.coefficients.map(({ key }) => key);

    for (const rule of pricingDataset.rules) {
      const cost = validateFormula({
        level: rule.level,
        kind: 'cost',
        source: rule.costFormula,
        coefficientKeys,
      });
      expect(cost.errors, rule.id).toEqual([]);
      expect([...cost.coefficientKeys].sort(), rule.id).toEqual(
        [...rule.coefficientKeys].sort(),
      );

      if (rule.quantityFormula !== null) {
        const quantity = validateFormula({
          level: rule.level,
          kind: 'quantity',
          source: rule.quantityFormula,
          coefficientKeys,
        });
        expect(quantity.errors, rule.id).toEqual([]);
      }
    }
  });
});

describe('pricingDatasetSchema', () => {
  it('rejects a gap between rate ranges', () => {
    const rates = pricingDataset.baseRates.filter(
      (rate) =>
        !(rate.finishLevel === FinishLevel.ROUGH && rate.areaFromSqm === 45),
    );

    expect(pricingDatasetSchema.safeParse(withBaseRates(rates)).success).toBe(
      false,
    );
  });

  it('rejects overlapping rate ranges', () => {
    const rates = pricingDataset.baseRates.map((rate) =>
      rate.finishLevel === FinishLevel.ROUGH && rate.areaFromSqm === 30
        ? { ...rate, areaFromSqm: 25 }
        : rate,
    );

    expect(pricingDatasetSchema.safeParse(withBaseRates(rates)).success).toBe(
      false,
    );
  });

  it('rejects rates that stop at the maximum area', () => {
    const rates = pricingDataset.baseRates.map((rate) =>
      rate.areaToSqm === 500.01 ? { ...rate, areaToSqm: 500 } : rate,
    );

    expect(pricingDatasetSchema.safeParse(withBaseRates(rates)).success).toBe(
      false,
    );
  });

  it('rejects a rule that uses an unknown coefficient', () => {
    const rules = pricingDataset.rules.map((rule, index) =>
      index === 0 ? { ...rule, coefficientKeys: ['missing'] } : rule,
    );

    expect(
      pricingDatasetSchema.safeParse({ ...pricingDataset, rules }).success,
    ).toBe(false);
  });

  it('rejects an object rule with a category or a category rule without one', () => {
    const [categoryRule] = pricingDataset.rules;

    expect(
      pricingDatasetSchema.safeParse({
        ...pricingDataset,
        rules: [{ ...categoryRule, categoryId: null }],
      }).success,
    ).toBe(false);
    expect(
      pricingDatasetSchema.safeParse({
        ...pricingDataset,
        rules: [{ ...categoryRule, level: RuleLevel.OBJECT }],
      }).success,
    ).toBe(false);
  });

  it('rejects two rules for the same target', () => {
    const [categoryRule] = pricingDataset.rules;
    const rules = [
      categoryRule,
      { ...categoryRule, id: '3b9b1f7e-6e0c-4f5e-9f7a-0c1f2d3e4a5b' },
    ];

    expect(
      pricingDatasetSchema.safeParse({ ...pricingDataset, rules }).success,
    ).toBe(false);
  });
});
