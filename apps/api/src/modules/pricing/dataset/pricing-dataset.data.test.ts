import { describe, expect, it } from 'vitest';
import { catalogDataset } from '../../catalog/dataset/data';
import { pricingDataset } from './data';

describe('seed coefficients', () => {
  it('uses every coefficient in at least one rule or option', () => {
    const used = new Set([
      ...pricingDataset.rules.flatMap((rule) => rule.coefficientKeys),
      ...catalogDataset.options.flatMap(
        (option) => option.priceCoefficientKeys,
      ),
    ]);

    for (const { key } of pricingDataset.coefficients) {
      expect(used.has(key), key).toBe(true);
    }
  });
});
