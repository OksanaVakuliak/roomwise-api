import { describe, expect, it } from 'vitest';
import { CoefficientGroup } from '../../../generated/prisma/enums';
import { catalogDataset } from '../../catalog/dataset/data';
import { pricingDataset } from './data';
import { coefficients } from './data/coefficients';

const groups: string[] = Object.values(CoefficientGroup);

function usedCoefficientKeys(): Set<string> {
  return new Set([
    ...pricingDataset.rules.flatMap((rule) => rule.coefficientKeys),
    ...catalogDataset.options.flatMap((option) => option.priceCoefficientKeys),
  ]);
}

describe('seed coefficients', () => {
  it('declares a group of the enum on every coefficient', () => {
    for (const coefficient of coefficients) {
      expect(groups, coefficient.key).toContain(coefficient.group);
    }
  });

  it('names every coefficient and its unit in both languages', () => {
    for (const { key, name, unit } of coefficients) {
      expect(name.en.trim(), `${key} name.en`).not.toBe('');
      expect(name.uk.trim(), `${key} name.uk`).not.toBe('');
      expect(unit.en.trim(), `${key} unit.en`).not.toBe('');
      expect(unit.uk.trim(), `${key} unit.uk`).not.toBe('');
    }
  });

  it('gives every coefficient a positive value', () => {
    for (const { key, value } of coefficients) {
      expect(value, key).toBeGreaterThan(0);
    }
  });

  it('uses every coefficient in at least one rule or option', () => {
    const used = usedCoefficientKeys();

    for (const { key } of coefficients) {
      expect(used.has(key), key).toBe(true);
    }
  });
});
