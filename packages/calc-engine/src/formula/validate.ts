import {
  FinishLevelSchema,
  KitchenTypeSchema,
  ProductUnitSchema,
  RoomTypeCodeSchema,
  type RuleLevel,
} from '../schemas';
import { parse } from './parse';
import { suggestNearest } from './suggest';
import type { FormulaError, FormulaNode } from './types';

export type FormulaKind = 'quantity' | 'cost';
export type FormulaScope = 'room' | 'product' | 'object';

export interface FormulaVariable {
  readonly name: string;
  readonly kind: 'number' | 'boolean' | 'enum';
  readonly values?: readonly string[];
}

const number = (name: string): FormulaVariable => ({ name, kind: 'number' });
const boolean = (name: string): FormulaVariable => ({ name, kind: 'boolean' });
const enumeration = (
  name: string,
  values: readonly string[],
): FormulaVariable => ({ name, kind: 'enum', values });

export const FORMULA_SCOPE_VARIABLES: Record<
  FormulaScope,
  readonly FormulaVariable[]
> = {
  room: [
    number('length'),
    number('width'),
    number('height'),
    number('floorArea'),
    number('perimeter'),
    number('wallArea'),
    boolean('heatedFloor'),
    enumeration('roomType', RoomTypeCodeSchema.options),
  ],
  product: [
    number('price'),
    number('waste'),
    enumeration('unit', ProductUnitSchema.options),
  ],
  object: [
    number('totalArea'),
    number('balconyArea'),
    boolean('balconyTiles'),
    boolean('gas'),
    enumeration('kitchenType', KitchenTypeSchema.options),
    enumeration('finishLevel', FinishLevelSchema.options),
    number('roomsCount'),
    number('bathroomsCount'),
  ],
};

export const FORMULA_QUANTITY_VARIABLE: FormulaVariable = number('quantity');

export const FORMULA_VARIABLES: Record<RuleLevel, readonly FormulaVariable[]> =
  {
    OBJECT: FORMULA_SCOPE_VARIABLES.object,
    CATEGORY: [
      ...FORMULA_SCOPE_VARIABLES.room,
      ...FORMULA_SCOPE_VARIABLES.product,
      ...FORMULA_SCOPE_VARIABLES.object,
    ],
    MATERIAL_TYPE: [
      ...FORMULA_SCOPE_VARIABLES.room,
      ...FORMULA_SCOPE_VARIABLES.product,
      ...FORMULA_SCOPE_VARIABLES.object,
    ],
  };

export const FORMULA_FUNCTIONS = [
  'min',
  'max',
  'round',
  'ceil',
  'floor',
] as const;

export const COEFFICIENT_NAMESPACE = 'coef';

export interface ValidateFormulaInput {
  readonly level: RuleLevel;
  readonly kind: FormulaKind;
  readonly source: string;
  readonly coefficientKeys: readonly string[];
}

export interface ValidateFormulaResult {
  readonly valid: boolean;
  readonly coefficientKeys: string[];
  readonly errors: FormulaError[];
}

const ALL_VARIABLE_NAMES: ReadonlySet<string> = new Set(
  FORMULA_VARIABLES.CATEGORY.map((variable) => variable.name),
);

function span(node: FormulaNode): { position: number; length: number } {
  return { position: node.start, length: node.end - node.start };
}

export function validateFormula(
  input: ValidateFormulaInput,
): ValidateFormulaResult {
  const parsed = parse(input.source);
  if (!parsed.ok) {
    return { valid: false, coefficientKeys: [], errors: [parsed.error] };
  }

  const allowed = new Set(
    FORMULA_VARIABLES[input.level].map((variable) => variable.name),
  );
  const allowedNames = [...allowed];
  const knownCoefficients = new Set(input.coefficientKeys);
  const usedCoefficients = new Set<string>();
  const errors: FormulaError[] = [];
  const quantityAllowed = input.kind === 'cost' && input.level !== 'OBJECT';

  function identifier(node: FormulaNode & { type: 'Identifier' }): void {
    const { name } = node;
    if (name === FORMULA_QUANTITY_VARIABLE.name) {
      if (!quantityAllowed) {
        errors.push({ code: 'QUANTITY_NOT_ALLOWED', ...span(node) });
      }
      return;
    }
    if (allowed.has(name)) {
      return;
    }
    if (ALL_VARIABLE_NAMES.has(name)) {
      errors.push({
        code: 'VARIABLE_NOT_ALLOWED_AT_LEVEL',
        ...span(node),
        params: { variable: name, level: input.level },
      });
      return;
    }
    const suggestion = suggestNearest(name, allowedNames);
    errors.push({
      code: 'UNKNOWN_VARIABLE',
      ...span(node),
      params: suggestion === undefined ? { name } : { name, suggestion },
    });
  }

  function walk(node: FormulaNode): void {
    switch (node.type) {
      case 'Literal':
        return;
      case 'Identifier':
        identifier(node);
        return;
      case 'Member': {
        const { object, property } = node;
        if (
          object.type !== 'Identifier' ||
          object.name !== COEFFICIENT_NAMESPACE
        ) {
          errors.push({
            code: 'UNKNOWN_VARIABLE',
            ...span(node),
            params: { name: input.source.slice(node.start, node.end) },
          });
          return;
        }
        usedCoefficients.add(property.name);
        if (!knownCoefficients.has(property.name)) {
          errors.push({
            code: 'UNKNOWN_COEFFICIENT',
            ...span(node),
            params: { key: property.name },
          });
        }
        return;
      }
      case 'Call': {
        const { callee } = node;
        if (
          callee.type !== 'Identifier' ||
          !(FORMULA_FUNCTIONS as readonly string[]).includes(callee.name)
        ) {
          errors.push({
            code: 'UNKNOWN_FUNCTION',
            ...span(callee),
            params: { name: input.source.slice(callee.start, callee.end) },
          });
        }
        for (const argument of node.args) {
          walk(argument);
        }
        return;
      }
      case 'Unary':
        walk(node.argument);
        return;
      case 'Binary':
        walk(node.left);
        walk(node.right);
        return;
      case 'Conditional':
        walk(node.test);
        walk(node.consequent);
        walk(node.alternate);
    }
  }

  walk(parsed.ast);

  return {
    valid: errors.length === 0,
    coefficientKeys: [...usedCoefficients],
    errors,
  };
}
