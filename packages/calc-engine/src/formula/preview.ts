import { pricedLine, roundQuantity } from '../estimate/line';
import { runNumericFormula } from '../estimate/run-formula';
import type {
  EstimateMessage,
  RuleLevel,
  RulePreview,
  RuleSample,
} from '../schemas';
import { productVariablesOf, roomVariables } from '../variables';
import type { FormulaValue } from './evaluate';
import { COEFFICIENT_NAMESPACE } from './language';
import { parse } from './parse';
import type { FormulaNode } from './types';

export interface PreviewRuleInput {
  readonly level: RuleLevel;
  readonly quantityFormula: string | null;
  readonly costFormula: string;
  readonly coefficients: Readonly<Record<string, number>>;
  readonly sample: RuleSample;
}

type Variables = Record<string, FormulaValue>;

interface References {
  readonly variables: Set<string>;
  readonly coefficients: Set<string>;
}

function collectReferences(node: FormulaNode, found: References): void {
  switch (node.type) {
    case 'Identifier':
      found.variables.add(node.name);
      return;
    case 'Member':
      if (
        node.object.type === 'Identifier' &&
        node.object.name === COEFFICIENT_NAMESPACE
      ) {
        found.coefficients.add(node.property.name);
      }
      return;
    case 'Call':
      node.args.forEach((argument) => collectReferences(argument, found));
      return;
    case 'Unary':
      collectReferences(node.argument, found);
      return;
    case 'Binary':
      collectReferences(node.left, found);
      collectReferences(node.right, found);
      return;
    case 'Conditional':
      collectReferences(node.test, found);
      collectReferences(node.consequent, found);
      collectReferences(node.alternate, found);
      return;
    case 'Literal':
      return;
  }
}

function referencesOf(sources: readonly (string | null)[]): References {
  const found: References = { variables: new Set(), coefficients: new Set() };
  for (const source of sources) {
    const parsed = source === null ? undefined : parse(source);
    if (parsed?.ok) {
      collectReferences(parsed.ast, found);
    }
  }
  return found;
}

function objectScope({ object }: RuleSample): Variables {
  return {
    totalArea: object.totalAreaSqm,
    balconyArea: object.balconyAreaSqm,
    balconyTiles: object.balconyTiles,
    gas: object.gas,
    kitchenType: object.kitchenType,
    finishLevel: object.finishLevel,
    roomsCount: object.roomsCount,
    bathroomsCount: object.bathroomsCount,
  };
}

function scopeOf(
  level: RuleLevel,
  sample: RuleSample,
): { scope: Variables } | { error: EstimateMessage } {
  if (level === 'OBJECT') {
    return { scope: objectScope(sample) };
  }
  const { room, product } = sample;
  if (room === undefined || product === undefined) {
    return {
      error: {
        code: 'SAMPLE_INCOMPLETE',
        params: { missing: room === undefined ? 'room' : 'product' },
      },
    };
  }
  return {
    scope: {
      ...roomVariables(room),
      ...productVariablesOf(product, product.wastePercent),
      ...objectScope(sample),
    },
  };
}

function pick<Value>(
  source: Readonly<Record<string, Value>>,
  names: ReadonlySet<string>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(source).filter(([name]) => names.has(name)),
  );
}

export function previewRule(input: PreviewRuleInput): RulePreview {
  const { level, quantityFormula, costFormula, coefficients } = input;
  const references = referencesOf([quantityFormula, costFormula]);
  const report = (
    variables: Variables,
    quantity: number | null,
    amountCents: number | null,
    error: EstimateMessage | null,
  ): RulePreview => ({
    quantity,
    amountCents,
    variables: pick(variables, references.variables),
    coefficients: pick(coefficients, references.coefficients),
    error,
  });

  if ((level === 'OBJECT') !== (quantityFormula === null)) {
    return report({}, null, null, { code: 'QUANTITY_FORMULA_MISMATCH' });
  }
  const prepared = scopeOf(level, input.sample);
  if ('error' in prepared) {
    return report({}, null, null, prepared.error);
  }

  let variables = prepared.scope;
  let quantity: number | null = null;
  if (quantityFormula !== null) {
    const raw = runNumericFormula(quantityFormula, { variables, coefficients });
    if (!raw.ok) {
      return report(variables, null, null, raw.error);
    }
    variables = { ...variables, quantity: raw.value };
    quantity = roundQuantity(raw.value);
  }

  const cost = runNumericFormula(costFormula, { variables, coefficients });
  if (!cost.ok) {
    return report(variables, quantity, null, cost.error);
  }
  const line = pricedLine({ id: 'preview', section: 'OBJECT' }, cost.value);
  return line.error === null
    ? report(variables, quantity, line.amountCents, null)
    : report(variables, quantity, null, line.error);
}
