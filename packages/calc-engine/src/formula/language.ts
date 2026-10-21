export const COEFFICIENT_NAMESPACE = 'coef';

export interface FormulaFunction {
  readonly name: string;
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly apply: (args: readonly number[]) => number;
}

export const FORMULA_FUNCTION_TABLE: ReadonlyMap<string, FormulaFunction> =
  new Map(
    (
      [
        {
          name: 'min',
          minArgs: 1,
          maxArgs: Number.POSITIVE_INFINITY,
          apply: (args) => Math.min(...args),
        },
        {
          name: 'max',
          minArgs: 1,
          maxArgs: Number.POSITIVE_INFINITY,
          apply: (args) => Math.max(...args),
        },
        {
          name: 'round',
          minArgs: 1,
          maxArgs: 1,
          apply: (args) => Math.round(args[0]),
        },
        {
          name: 'ceil',
          minArgs: 1,
          maxArgs: 1,
          apply: (args) => Math.ceil(args[0]),
        },
        {
          name: 'floor',
          minArgs: 1,
          maxArgs: 1,
          apply: (args) => Math.floor(args[0]),
        },
      ] satisfies FormulaFunction[]
    ).map((fn) => [fn.name, fn]),
  );

export const FORMULA_FUNCTIONS: readonly string[] = [
  ...FORMULA_FUNCTION_TABLE.keys(),
];
