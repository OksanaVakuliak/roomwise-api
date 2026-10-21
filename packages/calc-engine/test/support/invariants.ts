import { expect } from 'vitest';
import { convertCentsToKopecks, type Estimate, SectionSchema } from '../../src';

export function expectEstimateInvariants(estimate: Estimate): void {
  const rate = estimate.exchangeRate?.rate ?? null;
  let sectionsUsd = 0;
  let sectionsUah = 0;
  for (const section of SectionSchema.options) {
    const lines = estimate.lines.filter((line) => line.section === section);
    const usd = lines.reduce((sum, line) => sum + line.amountCents, 0);
    expect(estimate.totals.sections[section].usdCents).toBe(usd);
    sectionsUsd += usd;
    if (rate === null) {
      expect(estimate.totals.sections[section].uahKopecks).toBeNull();
      continue;
    }
    const uah = lines.reduce(
      (sum, line) => sum + (line.amountUahKopecks ?? 0),
      0,
    );
    expect(estimate.totals.sections[section].uahKopecks).toBe(uah);
    sectionsUah += uah;
  }
  expect(estimate.totals.usdCents).toBe(sectionsUsd);
  expect(estimate.totals.uahKopecks).toBe(rate === null ? null : sectionsUah);
  for (const line of estimate.lines) {
    expect(Number.isSafeInteger(line.amountCents)).toBe(true);
    expect(line.amountUahKopecks).toBe(
      rate === null ? null : convertCentsToKopecks(line.amountCents, rate),
    );
    if (line.status !== 'OK') {
      expect(line.amountCents).toBe(0);
    }
  }
  expect(new Set(estimate.lines.map((line) => line.id)).size).toBe(
    estimate.lines.length,
  );
}
