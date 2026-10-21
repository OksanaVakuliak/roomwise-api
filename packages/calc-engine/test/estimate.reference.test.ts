import { describe, expect, it } from 'vitest';
import {
  type Configuration,
  ConfigurationSchema,
  type Estimate,
  EstimateSchema,
  estimate,
  type PricingData,
  PricingDataSchema,
} from '../src';
import edgeCases from './fixtures/reference/edge-cases.json';
import reference from './fixtures/reference/us1-reference.json';
import referenceRequest from './fixtures/reference/us1-reference.request.json';
import scenarios from './fixtures/reference/us1-scenarios.json';
import { expectEstimateInvariants } from './support/invariants';

interface ExpectedCase {
  lineCount: number;
  currency?: string;
  lines: Record<string, unknown>[];
  absentLineIds?: string[];
  warnings?: Record<string, unknown>[];
  totals: { usdCents: number; uahKopecks?: number | null };
  incomplete: boolean;
}

interface Case {
  name: string;
  description: string;
  pricingData: Partial<PricingData>;
  configuration: Configuration;
  expected: ExpectedCase;
}

const referenceData = PricingDataSchema.parse(reference.pricingData);

function runCase(fixture: Case): Estimate {
  const data = PricingDataSchema.parse({
    ...referenceData,
    ...fixture.pricingData,
  });
  const result = estimate(
    ConfigurationSchema.parse(fixture.configuration),
    data,
  );
  EstimateSchema.parse(result);
  expectEstimateInvariants(result);
  return result;
}

function describeCases(title: string, cases: Case[]): void {
  describe(title, () => {
    it.each(cases)('$name', (fixture) => {
      const result = runCase(fixture);
      const { expected } = fixture;
      expect(result.lines).toHaveLength(expected.lineCount);
      for (const line of expected.lines) {
        expect(result.lines.find((item) => item.id === line.id)).toMatchObject(
          line,
        );
      }
      for (const id of expected.absentLineIds ?? []) {
        expect(result.lines.map((line) => line.id)).not.toContain(id);
      }
      expect(result.totals.usdCents).toBe(expected.totals.usdCents);
      if (expected.totals.uahKopecks !== undefined) {
        expect(result.totals.uahKopecks).toBe(expected.totals.uahKopecks);
      }
      if (expected.currency !== undefined) {
        expect(result.currency).toBe(expected.currency);
      }
      if (expected.warnings !== undefined) {
        expect(result.warnings).toEqual(expected.warnings);
      }
      expect(result.incomplete).toBe(expected.incomplete);
    });
  });
}

describe('US1 reference estimate', () => {
  const configuration = ConfigurationSchema.parse(referenceRequest);
  const result = estimate(configuration, referenceData);

  it('matches every hand-calculated line in order', () => {
    expect(result.lines).toHaveLength(reference.expected.lines.length);
    result.lines.forEach((line, index) => {
      expect(line).toMatchObject(reference.expected.lines[index]);
    });
  });

  it('matches the hand-calculated totals', () => {
    expect(result.totals).toEqual(reference.expected.totals);
    expect(result.totals.usdCents).toBe(1217291);
    expect(result.warnings).toEqual(reference.expected.warnings);
    expect(result.incomplete).toBe(reference.expected.incomplete);
  });

  it('carries the pricing version, rate and requested currency', () => {
    expect(result.pricingVersion).toBe(referenceData.version);
    expect(result.exchangeRate).toEqual(referenceData.exchangeRate);
    expect(result.currency).toBe('USD');
  });

  it('keeps the section sums equal to the totals in both currencies', () => {
    expectEstimateInvariants(result);
  });

  it('returns the same amounts for the UAH request', () => {
    const uah = estimate({ ...configuration, currency: 'UAH' }, referenceData);
    expect(uah.currency).toBe('UAH');
    expect(uah.totals).toEqual(result.totals);
    expect(uah.lines).toEqual(result.lines);
  });

  it('is identical after a JSON round trip', () => {
    const roundTrip = estimate(
      JSON.parse(JSON.stringify(configuration)),
      JSON.parse(JSON.stringify(referenceData)),
    );
    expect(roundTrip).toEqual(result);
  });
});

describeCases('US1 scenarios', scenarios as Case[]);
describeCases('edge cases', edgeCases as Case[]);
