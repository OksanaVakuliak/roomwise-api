import type { Configuration, EstimateLine, PricingData } from '../schemas';
import type { ObjectVariables } from '../variables';
import { failedLine, pricedLine } from './line';
import { lineId } from './line-id';
import { runNumericFormula } from './run-formula';

export function objectRuleLines(
  configuration: Configuration,
  data: PricingData,
  section: 'BASE' | 'OBJECT',
  variables: ObjectVariables,
): EstimateLine[] {
  if (section === 'BASE' && configuration.scope !== 'FULL') {
    return [];
  }
  const scope = {
    variables,
    coefficients: data.coefficients,
  };
  return data.rules
    .filter(
      (rule) =>
        rule.level === 'OBJECT' && rule.baseComponent === (section === 'BASE'),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((rule) => {
      const init = {
        id: lineId(section, rule.id),
        section,
        ruleId: rule.id,
      } as const;
      const outcome = runNumericFormula(rule.costFormula, scope);
      return outcome.ok
        ? pricedLine(init, outcome.value)
        : failedLine(init, 'ERROR', outcome.error);
    })
    .filter(
      (line) =>
        section !== 'BASE' || line.status !== 'OK' || line.amountCents !== 0,
    );
}
