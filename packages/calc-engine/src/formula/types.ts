export interface Span {
  readonly start: number;
  readonly end: number;
}

export type UnaryOperator = '-' | '!';

export type BinaryOperator =
  | '||'
  | '&&'
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | '+'
  | '-'
  | '*'
  | '/';

export interface LiteralNode extends Span {
  readonly type: 'Literal';
  readonly value: number | string | boolean;
}

export interface IdentifierNode extends Span {
  readonly type: 'Identifier';
  readonly name: string;
}

export interface MemberNode extends Span {
  readonly type: 'Member';
  readonly object: FormulaNode;
  readonly property: IdentifierNode;
}

export interface CallNode extends Span {
  readonly type: 'Call';
  readonly callee: FormulaNode;
  readonly args: readonly FormulaNode[];
}

export interface UnaryNode extends Span {
  readonly type: 'Unary';
  readonly operator: UnaryOperator;
  readonly argument: FormulaNode;
}

export interface BinaryNode extends Span {
  readonly type: 'Binary';
  readonly operator: BinaryOperator;
  readonly left: FormulaNode;
  readonly right: FormulaNode;
}

export interface ConditionalNode extends Span {
  readonly type: 'Conditional';
  readonly test: FormulaNode;
  readonly consequent: FormulaNode;
  readonly alternate: FormulaNode;
}

export type FormulaNode =
  | LiteralNode
  | IdentifierNode
  | MemberNode
  | CallNode
  | UnaryNode
  | BinaryNode
  | ConditionalNode;

export type FormulaErrorCode =
  | 'FORMULA_SYNTAX'
  | 'FORMULA_TOO_COMPLEX'
  | 'UNKNOWN_VARIABLE'
  | 'UNKNOWN_COEFFICIENT'
  | 'VARIABLE_NOT_ALLOWED_AT_LEVEL'
  | 'UNKNOWN_FUNCTION'
  | 'QUANTITY_NOT_ALLOWED';

export interface FormulaError<
  Code extends FormulaErrorCode = FormulaErrorCode,
> {
  readonly code: Code;
  readonly position: number;
  readonly length: number;
  readonly params?: Readonly<Record<string, string | number>>;
}
