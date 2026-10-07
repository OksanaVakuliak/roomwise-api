import { COEFFICIENT_NAMESPACE, FORMULA_FUNCTION_TABLE } from './language';
import type { FormulaNode, Span } from './types';

export type FormulaValue = number | boolean | string;

export type EvaluationReason =
  | 'DIVISION_BY_ZERO'
  | 'NOT_FINITE'
  | 'TYPE_MISMATCH';

export interface EvaluationError {
  readonly code:
    | 'FORMULA_RUNTIME_ERROR'
    | 'UNKNOWN_VARIABLE'
    | 'UNKNOWN_COEFFICIENT'
    | 'UNKNOWN_FUNCTION';
  readonly position: number;
  readonly length: number;
  readonly params?: Readonly<Record<string, string | number>>;
}

export type EvaluationResult =
  | { readonly ok: true; readonly value: FormulaValue }
  | { readonly ok: false; readonly error: EvaluationError };

export interface EvaluationScope {
  readonly variables: object;
  readonly coefficients: Readonly<Record<string, number>>;
}

type NodeOf<Type extends FormulaNode['type']> = Extract<
  FormulaNode,
  { type: Type }
>;

class EvaluationFailure {
  constructor(readonly error: EvaluationError) {}
}

function fail(
  node: Span,
  code: EvaluationError['code'],
  params?: Readonly<Record<string, string | number>>,
): never {
  throw new EvaluationFailure({
    code,
    position: node.start,
    length: node.end - node.start,
    ...(params === undefined ? {} : { params }),
  });
}

function runtimeFail(
  node: Span,
  reason: EvaluationReason,
  params?: Readonly<Record<string, string | number>>,
): never {
  return fail(node, 'FORMULA_RUNTIME_ERROR', { ...params, reason });
}

function mismatch(node: Span, expected: string): never {
  return runtimeFail(node, 'TYPE_MISMATCH', { expected });
}

function finite(node: Span, value: number): number {
  return Number.isFinite(value) ? value : runtimeFail(node, 'NOT_FINITE');
}

function asNumber(node: Span, value: FormulaValue): number {
  return typeof value === 'number' ? value : mismatch(node, 'number');
}

function asBoolean(node: Span, value: FormulaValue): boolean {
  return typeof value === 'boolean' ? value : mismatch(node, 'boolean');
}

function lookupVariable(
  node: NodeOf<'Identifier'>,
  scope: EvaluationScope,
): FormulaValue {
  if (!Object.hasOwn(scope.variables, node.name)) {
    return fail(node, 'UNKNOWN_VARIABLE', { name: node.name });
  }
  return (scope.variables as Record<string, FormulaValue>)[node.name];
}

function evaluateMember(
  node: NodeOf<'Member'>,
  scope: EvaluationScope,
): number {
  if (
    node.object.type !== 'Identifier' ||
    node.object.name !== COEFFICIENT_NAMESPACE
  ) {
    return fail(node, 'UNKNOWN_VARIABLE');
  }
  const key = node.property.name;
  if (!Object.hasOwn(scope.coefficients, key)) {
    return fail(node, 'UNKNOWN_COEFFICIENT', { key });
  }
  return scope.coefficients[key];
}

function evaluateCall(node: NodeOf<'Call'>, scope: EvaluationScope): number {
  const spec =
    node.callee.type === 'Identifier'
      ? FORMULA_FUNCTION_TABLE.get(node.callee.name)
      : undefined;
  if (spec === undefined) {
    return fail(node.callee, 'UNKNOWN_FUNCTION');
  }
  if (node.args.length < spec.minArgs || node.args.length > spec.maxArgs) {
    return mismatch(node, 'argument count');
  }
  const args = node.args.map((arg) => asNumber(arg, walk(arg, scope)));
  return finite(node, spec.apply(args));
}

function evaluateEquality(
  node: NodeOf<'Binary'>,
  scope: EvaluationScope,
): boolean {
  const { left, right } = node;
  const literal =
    [left, right].find(
      (side): side is NodeOf<'Literal'> =>
        side.type === 'Literal' && typeof side.value === 'string',
    ) ?? null;
  if (literal !== null) {
    const other = literal === left ? right : left;
    const variable =
      other.type === 'Identifier' ? lookupVariable(other, scope) : undefined;
    if (typeof variable !== 'string') {
      return mismatch(other, 'enum variable');
    }
    return node.operator === '=='
      ? variable === literal.value
      : variable !== literal.value;
  }
  const leftValue = walk(left, scope);
  const rightValue = walk(right, scope);
  if (typeof leftValue !== typeof rightValue) {
    return mismatch(right, typeof leftValue);
  }
  return node.operator === '=='
    ? leftValue === rightValue
    : leftValue !== rightValue;
}

function evaluateBinary(
  node: NodeOf<'Binary'>,
  scope: EvaluationScope,
): FormulaValue {
  const { operator, left, right } = node;
  if (operator === '==' || operator === '!=') {
    return evaluateEquality(node, scope);
  }
  if (operator === '&&' || operator === '||') {
    const leftValue = asBoolean(left, walk(left, scope));
    if (operator === '&&' ? !leftValue : leftValue) {
      return leftValue;
    }
    return asBoolean(right, walk(right, scope));
  }
  const a = asNumber(left, walk(left, scope));
  const b = asNumber(right, walk(right, scope));
  switch (operator) {
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
    case '+':
      return finite(node, a + b);
    case '-':
      return finite(node, a - b);
    case '*':
      return finite(node, a * b);
    case '/':
      return b === 0
        ? runtimeFail(node, 'DIVISION_BY_ZERO')
        : finite(node, a / b);
  }
}

function walk(node: FormulaNode, scope: EvaluationScope): FormulaValue {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string'
        ? mismatch(node, 'number or boolean')
        : node.value;
    case 'Identifier':
      return lookupVariable(node, scope);
    case 'Member':
      return evaluateMember(node, scope);
    case 'Call':
      return evaluateCall(node, scope);
    case 'Unary': {
      const argument = walk(node.argument, scope);
      return node.operator === '!'
        ? !asBoolean(node.argument, argument)
        : finite(node, -asNumber(node.argument, argument));
    }
    case 'Binary':
      return evaluateBinary(node, scope);
    case 'Conditional':
      return asBoolean(node.test, walk(node.test, scope))
        ? walk(node.consequent, scope)
        : walk(node.alternate, scope);
    default:
      return runtimeFail(node as Span, 'TYPE_MISMATCH', {
        expected: 'known node',
      });
  }
}

export function evaluate(
  ast: FormulaNode,
  scope: EvaluationScope,
): EvaluationResult {
  try {
    return { ok: true, value: walk(ast, scope) };
  } catch (error) {
    if (error instanceof EvaluationFailure) {
      return { ok: false, error: error.error };
    }
    throw error;
  }
}
