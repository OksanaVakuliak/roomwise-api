import { describe, expect, it } from 'vitest';
import {
  ConfigurationSchema,
  checkLimits,
  EstimateSchema,
  estimate,
  PricingDataSchema,
} from '../src';
import generated from './fixtures/generated.json';
import reference from './fixtures/reference/us1-reference.json';
import { generateConfigurations } from './generate-fixtures';
import { expectEstimateInvariants } from './support/invariants';

const data = PricingDataSchema.parse(reference.pricingData);
const configurations = generated.map((item) => ConfigurationSchema.parse(item));

describe('generated configurations', () => {
  it('contains 50 configurations that regenerate from the seed', () => {
    expect(configurations).toHaveLength(50);
    expect(generateConfigurations(data, 20260914, 50)).toEqual(configurations);
  });

  it('stay within the limits of the dataset', () => {
    for (const configuration of configurations) {
      expect(checkLimits(configuration, data.limits, data.options)).toEqual([]);
    }
  });

  it.each(
    configurations.map(
      (configuration, index) => [index, configuration] as const,
    ),
  )(
    'configuration %i keeps the section and grand totals consistent',
    (_, configuration) => {
      const result = estimate(configuration, data);
      EstimateSchema.parse(result);
      expectEstimateInvariants(result);
    },
  );

  it('calculates the same estimate after a JSON round trip', () => {
    for (const configuration of configurations) {
      expect(estimate(JSON.parse(JSON.stringify(configuration)), data)).toEqual(
        estimate(configuration, data),
      );
    }
  });
});
