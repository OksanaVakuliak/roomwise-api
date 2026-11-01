import { convertCentsToKopecks } from '../money';
import type {
  Configuration,
  Estimate,
  EstimateLine,
  PricingData,
} from '../schemas';
import { additionalLines } from './additional';
import { engineeringLines } from './engineering';
import { materialLines } from './materials';
import { objectRuleLines } from './object-rules';
import { computeTotals, isIncomplete } from './totals';
import { estimateWarnings } from './warnings';

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
    ...objectRuleLines(configuration, data, 'BASE'),
    ...objectRuleLines(configuration, data, 'OBJECT'),
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
    warnings: estimateWarnings(lines, configuration, rate, data.limits),
    incomplete: isIncomplete(lines),
  };
}
