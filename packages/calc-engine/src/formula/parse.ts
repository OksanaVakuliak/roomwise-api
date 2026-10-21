import { parseRaw, type RawNode } from './grammar';
import type {
  BinaryOperator,
  FormulaError,
  FormulaNode,
  IdentifierNode,
  Span,
  UnaryOperator,
} from './types';

export const FORMULA_LIMITS = {
  maxLength: 500,
  maxDepth: 32,
  maxNodes: 200,
} as const;

export type ParseError = FormulaError<'FORMULA_SYNTAX' | 'FORMULA_TOO_COMPLEX'>;

export type ParseResult =
  | { readonly ok: true; readonly ast: FormulaNode }
  | { readonly ok: false; readonly error: ParseError };

class ParseFailure extends Error {
  constructor(readonly error: ParseError) {
    super(error.code);
  }
}

function syntaxFailure(detail: string, span: Span): ParseFailure {
  return new ParseFailure({
    code: 'FORMULA_SYNTAX',
    position: span.start,
    length: span.end - span.start,
    params: { detail },
  });
}

function span(raw: RawNode, children: readonly Span[]): Span {
  return {
    start: Math.min(
      raw.start ?? Number.POSITIVE_INFINITY,
      ...children.map((node) => node.start),
    ),
    end: Math.max(
      raw.end ?? Number.NEGATIVE_INFINITY,
      ...children.map((node) => node.end),
    ),
  };
}

function child(raw: unknown): RawNode {
  return raw as RawNode;
}

function convertIdentifier(raw: RawNode): IdentifierNode {
  return {
    type: 'Identifier',
    name: String(raw.name),
    ...span(raw, []),
  };
}

function convert(raw: RawNode): FormulaNode {
  switch (raw.type) {
    case 'Literal': {
      return {
        type: 'Literal',
        value: raw.value as number | string | boolean,
        ...span(raw, []),
      };
    }
    case 'Identifier':
      return convertIdentifier(raw);
    case 'MemberExpression': {
      const property = child(raw.property);
      if (raw.computed || raw.optional || property.type !== 'Identifier') {
        throw syntaxFailure('Only dotted access is supported', span(raw, []));
      }
      const object = convert(child(raw.object));
      const identifier = convertIdentifier(property);
      return {
        type: 'Member',
        object,
        property: identifier,
        ...span(raw, [object, identifier]),
      };
    }
    case 'CallExpression': {
      const callee = convert(child(raw.callee));
      const args = (raw.arguments as RawNode[]).map(convert);
      return { type: 'Call', callee, args, ...span(raw, [callee, ...args]) };
    }
    case 'UnaryExpression': {
      const operator = String(raw.operator);
      const argument = convert(child(raw.argument));
      return {
        type: 'Unary',
        operator: operator as UnaryOperator,
        argument,
        ...span(raw, [argument]),
      };
    }
    case 'BinaryExpression': {
      const operator = String(raw.operator);
      const left = convert(child(raw.left));
      const right = convert(child(raw.right));
      return {
        type: 'Binary',
        operator: operator as BinaryOperator,
        left,
        right,
        ...span(raw, [left, right]),
      };
    }
    case 'ConditionalExpression': {
      const test = convert(child(raw.test));
      const consequent = convert(child(raw.consequent));
      const alternate = convert(child(raw.alternate));
      return {
        type: 'Conditional',
        test,
        consequent,
        alternate,
        ...span(raw, [test, consequent, alternate]),
      };
    }
    case 'Compound': {
      const body = (raw.body as RawNode[]).map(convert);
      throw syntaxFailure('Unexpected expression', body[1] as FormulaNode);
    }
    case 'SequenceExpression': {
      const expressions = (raw.expressions as RawNode[]).map(convert);
      throw syntaxFailure(
        'Sequences are not supported',
        expressions[1] as FormulaNode,
      );
    }
    default:
      throw syntaxFailure(`${raw.type} is not supported`, span(raw, []));
  }
}

function children(node: FormulaNode): readonly FormulaNode[] {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return [];
    case 'Member':
      return [node.object, node.property];
    case 'Call':
      return [node.callee, ...node.args];
    case 'Unary':
      return [node.argument];
    case 'Binary':
      return [node.left, node.right];
    case 'Conditional':
      return [node.test, node.consequent, node.alternate];
  }
}

function complexityFailure(
  limit: 'DEPTH' | 'NODES',
  max: number,
  node: Span,
): ParseFailure {
  return new ParseFailure({
    code: 'FORMULA_TOO_COMPLEX',
    position: node.start,
    length: node.end - node.start,
    params: { limit, max },
  });
}

function checkComplexity(root: FormulaNode): void {
  let count = 0;
  const visit = (node: FormulaNode, depth: number): void => {
    if (depth > FORMULA_LIMITS.maxDepth) {
      throw complexityFailure('DEPTH', FORMULA_LIMITS.maxDepth, node);
    }
    count += 1;
    if (count > FORMULA_LIMITS.maxNodes) {
      throw complexityFailure('NODES', FORMULA_LIMITS.maxNodes, node);
    }
    for (const next of children(node)) {
      visit(next, depth + 1);
    }
  };
  visit(root, 1);
}

function jsepFailure(source: string, thrown: unknown): ParseFailure {
  const { index, description } = thrown as {
    index: number;
    description: string;
  };
  return new ParseFailure({
    code: 'FORMULA_SYNTAX',
    position: index,
    length: Number(index < source.length),
    params: { detail: description },
  });
}

export function parse(source: string): ParseResult {
  try {
    if (source.length > FORMULA_LIMITS.maxLength) {
      throw new ParseFailure({
        code: 'FORMULA_TOO_COMPLEX',
        position: FORMULA_LIMITS.maxLength,
        length: source.length - FORMULA_LIMITS.maxLength,
        params: { limit: 'LENGTH', max: FORMULA_LIMITS.maxLength },
      });
    }
    if (source.trim() === '') {
      throw syntaxFailure('Formula is empty', { start: 0, end: source.length });
    }
    let raw: RawNode;
    try {
      raw = parseRaw(source);
    } catch (thrown) {
      throw jsepFailure(source, thrown);
    }
    const ast = convert(raw);
    checkComplexity(ast);
    return { ok: true, ast };
  } catch (thrown) {
    if (!(thrown instanceof ParseFailure)) {
      throw thrown;
    }
    return { ok: false, error: thrown.error };
  }
}
