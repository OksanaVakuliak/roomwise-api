import { convertCentsToKopecks } from '../money';
import type {
  Configuration,
  Estimate,
  EstimateLine,
  PricingData,
} from '../schemas';
import { additionalLines } from './additional';
import { baseLine } from './base';
import { engineeringLines } from './engineering';
import { materialLines } from './materials';
import { objectRuleLines } from './object-rules';
import { collectWarnings, computeTotals, isIncomplete } from './totals';

function withKopecks(line: EstimateLine, rate: string | null): EstimateLine {
  return {
    ...line,
    amountUahKopecks:
      rate === null ? null : convertCentsToKopecks(line.amountCents, rate),
  };
}

export function estimate(
  configuration: Configuration,
  data: PricingData,
): Estimate {
  const rate = data.exchangeRate?.rate ?? null;
  const lines = [
    baseLine(configuration, data),
    ...objectRuleLines(configuration, data),
    ...materialLines(configuration, data),
    ...engineeringLines(configuration, data),
    ...additionalLines(configuration, data),
  ].map((line) => withKopecks(line, rate));
  return {
    pricingVersion: data.version,
    currency: configuration.currency,
    exchangeRate: data.exchangeRate,
    lines,
    totals: computeTotals(lines, rate !== null),
    warnings: collectWarnings(lines),
    incomplete: isIncomplete(lines),
  };
}
