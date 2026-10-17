import { toCents } from '../money';
import type { Configuration, EstimateLine, PricingData } from '../schemas';
import { objectVariables } from '../variables';
import { createLine, failedLine } from './line';
import { lineId } from './line-id';
import { runNumericFormula } from './run-formula';

export function objectRuleLines(
  configuration: Configuration,
  data: PricingData,
): EstimateLine[] {
  const scope = {
    variables: objectVariables(configuration),
    coefficients: data.coefficients,
  };
  return data.rules
    .filter((rule) => rule.level === 'OBJECT')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((rule) => {
      const init = {
        id: lineId('OBJECT', rule.id),
        section: 'OBJECT',
        ruleId: rule.id,
      } as const;
      const outcome = runNumericFormula(rule.costFormula, scope);
      return outcome.ok
        ? createLine({ ...init, amountCents: toCents(outcome.value) })
        : failedLine(init, 'ERROR', outcome.error);
    });
}
