import {
  FinishLevelSchema,
  KitchenTypeSchema,
  ProductUnitSchema,
  RoomTypeCodeSchema,
  type RuleLevel,
} from '../schemas';
import { COEFFICIENT_NAMESPACE, FORMULA_FUNCTION_TABLE } from './language';
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

type StaticType =
  | { readonly kind: 'number' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'string' }
  | { readonly kind: 'unknown' }
  | {
      readonly kind: 'enum';
      readonly name: string;
      readonly values: readonly string[];
    };

type NodeOf<Type extends FormulaNode['type']> = Extract<
  FormulaNode,
  { type: Type }
>;

const NUMBER: StaticType = { kind: 'number' };
const BOOLEAN: StaticType = { kind: 'boolean' };
const STRING: StaticType = { kind: 'string' };
const UNKNOWN: StaticType = { kind: 'unknown' };

function typeName(type: StaticType): string {
  return type.kind === 'enum' ? type.name : type.kind;
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

  const variables = FORMULA_VARIABLES[input.level];
  const variableTypes = new Map<string, StaticType>(
    variables.map((variable) => [
      variable.name,
      variable.kind === 'enum'
        ? { kind: 'enum', name: variable.name, values: variable.values ?? [] }
        : { kind: variable.kind },
    ]),
  );
  const allowedNames = variables.map((variable) => variable.name);
  const knownCoefficients = new Set(input.coefficientKeys);
  const usedCoefficients = new Set<string>();
  const errors: FormulaError[] = [];
  const quantityAllowed = input.kind === 'cost' && input.level !== 'OBJECT';

  function mismatch(node: FormulaNode, expected: string): void {
    errors.push({
      code: 'FORMULA_SYNTAX',
      ...span(node),
      params: { reason: 'TYPE_MISMATCH', expected },
    });
  }

  function expectType(
    node: FormulaNode,
    expected: 'number' | 'boolean',
  ): boolean {
    const type = infer(node);
    if (type.kind === 'unknown') {
      return false;
    }
    if (type.kind !== expected) {
      mismatch(node, expected);
      return false;
    }
    return true;
  }

  function identifier(node: NodeOf<'Identifier'>): StaticType {
    const { name } = node;
    if (name === FORMULA_QUANTITY_VARIABLE.name) {
      if (!quantityAllowed) {
        errors.push({ code: 'QUANTITY_NOT_ALLOWED', ...span(node) });
        return UNKNOWN;
      }
      return NUMBER;
    }
    const type = variableTypes.get(name);
    if (type !== undefined) {
      return type;
    }
    if (ALL_VARIABLE_NAMES.has(name)) {
      errors.push({
        code: 'VARIABLE_NOT_ALLOWED_AT_LEVEL',
        ...span(node),
        params: { variable: name, level: input.level },
      });
      return UNKNOWN;
    }
    const suggestion = suggestNearest(name, allowedNames);
    errors.push({
      code: 'UNKNOWN_VARIABLE',
      ...span(node),
      params: suggestion === undefined ? { name } : { name, suggestion },
    });
    return UNKNOWN;
  }

  function member(node: NodeOf<'Member'>): StaticType {
    const { object, property } = node;
    if (object.type !== 'Identifier' || object.name !== COEFFICIENT_NAMESPACE) {
      errors.push({
        code: 'UNKNOWN_VARIABLE',
        ...span(node),
        params: { name: input.source.slice(node.start, node.end) },
      });
      return UNKNOWN;
    }
    usedCoefficients.add(property.name);
    if (!knownCoefficients.has(property.name)) {
      errors.push({
        code: 'UNKNOWN_COEFFICIENT',
        ...span(node),
        params: { key: property.name },
      });
      return UNKNOWN;
    }
    return NUMBER;
  }

  function call(node: NodeOf<'Call'>): StaticType {
    const { callee } = node;
    const fn =
      callee.type === 'Identifier'
        ? FORMULA_FUNCTION_TABLE.get(callee.name)
        : undefined;
    if (fn === undefined) {
      errors.push({
        code: 'UNKNOWN_FUNCTION',
        ...span(callee),
        params: { name: input.source.slice(callee.start, callee.end) },
      });
      for (const argument of node.args) {
        infer(argument);
      }
      return UNKNOWN;
    }
    let sound = true;
    if (node.args.length < fn.minArgs || node.args.length > fn.maxArgs) {
      errors.push({
        code: 'FORMULA_SYNTAX',
        ...span(node),
        params: {
          reason: 'ARGUMENT_COUNT',
          min: fn.minArgs,
          ...(Number.isFinite(fn.maxArgs) ? { max: fn.maxArgs } : {}),
        },
      });
      sound = false;
    }
    for (const argument of node.args) {
      sound = expectType(argument, 'number') && sound;
    }
    return sound ? NUMBER : UNKNOWN;
  }

  function enumLiteral(literal: NodeOf<'Literal'>, other: FormulaNode): void {
    const type = infer(other);
    if (type.kind === 'unknown') {
      return;
    }
    if (other.type !== 'Identifier' || type.kind !== 'enum') {
      mismatch(other, 'enum variable');
      return;
    }
    if (!type.values.includes(literal.value as string)) {
      errors.push({
        code: 'FORMULA_SYNTAX',
        ...span(literal),
        params: {
          reason: 'UNKNOWN_ENUM_VALUE',
          value: literal.value as string,
          variable: type.name,
        },
      });
    }
  }

  function equality(node: NodeOf<'Binary'>): StaticType {
    const { left, right } = node;
    const literal = [left, right].find(
      (side): side is NodeOf<'Literal'> =>
        side.type === 'Literal' && typeof side.value === 'string',
    );
    if (literal !== undefined) {
      enumLiteral(literal, literal === left ? right : left);
      return BOOLEAN;
    }
    const a = infer(left);
    const b = infer(right);
    if (a.kind !== 'unknown' && b.kind !== 'unknown' && a.kind !== b.kind) {
      mismatch(right, typeName(a));
    }
    return BOOLEAN;
  }

  function binary(node: NodeOf<'Binary'>): StaticType {
    const { operator, left, right } = node;
    if (operator === '==' || operator === '!=') {
      return equality(node);
    }
    const logical = operator === '&&' || operator === '||';
    const operand = logical ? 'boolean' : 'number';
    const leftSound = expectType(left, operand);
    const rightSound = expectType(right, operand);
    if (!(leftSound && rightSound)) {
      return UNKNOWN;
    }
    const arithmetic = ['+', '-', '*', '/'].includes(operator);
    return logical || !arithmetic ? BOOLEAN : NUMBER;
  }

  function unary(node: NodeOf<'Unary'>): StaticType {
    const operand = node.operator === '!' ? 'boolean' : 'number';
    return expectType(node.argument, operand) ? { kind: operand } : UNKNOWN;
  }

  function conditional(node: NodeOf<'Conditional'>): StaticType {
    const testSound = expectType(node.test, 'boolean');
    const consequent = infer(node.consequent);
    const alternate = infer(node.alternate);
    if (consequent.kind === 'unknown') {
      return alternate;
    }
    if (alternate.kind === 'unknown') {
      return consequent;
    }
    if (consequent.kind !== alternate.kind) {
      mismatch(node.alternate, typeName(consequent));
      return UNKNOWN;
    }
    return testSound ? consequent : UNKNOWN;
  }

  function infer(node: FormulaNode): StaticType {
    switch (node.type) {
      case 'Literal':
        if (typeof node.value === 'string') {
          return STRING;
        }
        return typeof node.value === 'number' ? NUMBER : BOOLEAN;
      case 'Identifier':
        return identifier(node);
      case 'Member':
        return member(node);
      case 'Call':
        return call(node);
      case 'Unary':
        return unary(node);
      case 'Binary':
        return binary(node);
      case 'Conditional':
        return conditional(node);
    }
  }

  const resultType = infer(parsed.ast);
  if (resultType.kind !== 'unknown' && resultType.kind !== 'number') {
    mismatch(parsed.ast, 'number');
  }

  return {
    valid: errors.length === 0,
    coefficientKeys: [...usedCoefficients],
    errors,
  };
}
