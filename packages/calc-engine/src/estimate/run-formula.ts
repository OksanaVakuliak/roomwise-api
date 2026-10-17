import { type EvaluationScope, evaluate, parse } from '../formula';
import type { EstimateMessage } from '../schemas';

export type FormulaOutcome =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: EstimateMessage };

function message(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): EstimateMessage {
  return params === undefined ? { code } : { code, params: { ...params } };
}

function runtimeError(reason: string): FormulaOutcome {
  return { ok: false, error: message('FORMULA_RUNTIME_ERROR', { reason }) };
}

export function runNumericFormula(
  source: string,
  scope: EvaluationScope,
): FormulaOutcome {
  const parsed = parse(source);
  if (!parsed.ok) {
    return {
      ok: false,
      error: message(parsed.error.code, parsed.error.params),
    };
  }
  const result = evaluate(parsed.ast, scope);
  if (!result.ok) {
    return {
      ok: false,
      error: message(result.error.code, result.error.params),
    };
  }
  if (typeof result.value !== 'number') {
    return runtimeError('TYPE_MISMATCH');
  }
  if (result.value < 0) {
    return runtimeError('NEGATIVE');
  }
  if (!Number.isSafeInteger(Math.round(result.value * 100))) {
    return runtimeError('NOT_FINITE');
  }
  return { ok: true, value: result.value };
}
