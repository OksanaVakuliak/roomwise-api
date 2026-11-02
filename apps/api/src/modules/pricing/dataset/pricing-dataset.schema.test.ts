import { validateFormula } from '@roomwise/calc-engine';
import { describe, expect, it } from 'vitest';
import {
  CoefficientGroup,
  RuleLevel,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { catalogDataset } from '../../catalog/dataset/data';
import { pricingDataset } from './data';
import { pricingDatasetSchema } from './pricing-dataset.schema';

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
      missingAreaHintSqm: 5,
    });
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

  describe('surface rules and new columns', () => {
    const surfaceRule = {
      id: '3b9b1f7e-6e0c-4f5e-9f7a-0c1f2d3e4a5c',
      level: RuleLevel.SURFACE,
      categoryId: null,
      materialTypeId: null,
      surface: SurfaceKind.FLOOR,
      name: { en: 'Floor', uk: 'Підлога' },
      quantityFormula: null,
      costFormula: 'floorArea * 10',
      coefficientKeys: [],
      sortOrder: 0,
    };

    function parse(rules: unknown[]) {
      return pricingDatasetSchema.safeParse({ ...pricingDataset, rules });
    }

    it('accepts a surface rule and applies defaults', () => {
      const result = parse([surfaceRule]);

      expect(result.success).toBe(true);
      expect(result.data?.rules[0]).toMatchObject({
        baseComponent: false,
        laborFormula: null,
      });
    });

    it('rejects a surface rule without a surface', () => {
      expect(parse([{ ...surfaceRule, surface: null }]).success).toBe(false);
    });

    it('rejects a surface on a non-surface rule', () => {
      const [categoryRule] = pricingDataset.rules;

      expect(
        parse([{ ...categoryRule, surface: SurfaceKind.FLOOR }]).success,
      ).toBe(false);
    });

    it('rejects a surface rule with a category or a quantity formula', () => {
      const [categoryRule] = pricingDataset.rules;

      expect(
        parse([{ ...surfaceRule, categoryId: categoryRule.categoryId }])
          .success,
      ).toBe(false);
      expect(parse([{ ...surfaceRule, quantityFormula: '1' }]).success).toBe(
        false,
      );
    });

    it('rejects two surface rules for the same surface', () => {
      expect(
        parse([
          surfaceRule,
          { ...surfaceRule, id: '3b9b1f7e-6e0c-4f5e-9f7a-0c1f2d3e4a5d' },
        ]).success,
      ).toBe(false);
    });

    it('rejects a base component outside the object level', () => {
      expect(parse([{ ...surfaceRule, baseComponent: true }]).success).toBe(
        false,
      );
    });

    it('rejects a labor formula outside category and material type rules', () => {
      expect(parse([{ ...surfaceRule, laborFormula: '1' }]).success).toBe(
        false,
      );
    });

    it('accepts a labor formula on a category rule', () => {
      const [categoryRule] = pricingDataset.rules;

      expect(
        parse([{ ...categoryRule, laborFormula: 'quantity' }]).success,
      ).toBe(true);
    });

    it('defaults the coefficient group and the missing area hint', () => {
      const { missingAreaHintSqm: _hint, ...limits } = pricingDataset.limits;
      const { group: _group, ...coefficient } = pricingDataset.coefficients[0];
      const result = pricingDatasetSchema.safeParse({
        ...pricingDataset,
        limits,
        coefficients: [coefficient],
        rules: [],
      });

      expect(result.data?.limits.missingAreaHintSqm).toBe(5);
      expect(result.data?.coefficients[0].group).toBe(
        CoefficientGroup.MATERIAL_EXTRA,
      );
    });
  });
});
