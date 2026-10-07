import ternary from '@jsep-plugin/ternary';
import jsep from 'jsep';

export interface RawNode {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

interface Cursor {
  index: number;
  readonly expr: string;
  readonly code: number;
  gobbleSpaces(): void;
  throwError(message: string): never;
}

interface JsepClass {
  prototype: {
    gobbleToken(this: Cursor): RawNode | false | undefined;
    gobbleIdentifier(this: Cursor): RawNode;
  };
  removeBinaryOp(operator: string): void;
  removeUnaryOp(operator: string): void;
  removeLiteral(literal: string): void;
}

const SEMICOLON_CODE = 59;

const REMOVED_BINARY_OPERATORS = [
  '|',
  '^',
  '&',
  '<<',
  '>>',
  '>>>',
  '**',
  '%',
  '??',
  '===',
  '!==',
  'in',
  'instanceof',
];

const REMOVED_UNARY_OPERATORS = ['~', '+'];

const REMOVED_LITERALS = ['null'];

const { Jsep } = jsep as unknown as { Jsep: JsepClass };

function trimEnd(source: string, end: number): number {
  let result = Math.min(end, source.length);
  while (result > 0 && /\s/.test(source.charAt(result - 1))) {
    result -= 1;
  }
  return result;
}

function configure(): void {
  for (const operator of REMOVED_BINARY_OPERATORS) {
    Jsep.removeBinaryOp(operator);
  }
  for (const operator of REMOVED_UNARY_OPERATORS) {
    Jsep.removeUnaryOp(operator);
  }
  for (const literal of REMOVED_LITERALS) {
    Jsep.removeLiteral(literal);
  }

  jsep.plugins.register(ternary);

  jsep.hooks.add('gobble-spaces', function rejectSemicolon() {
    if (this.code === SEMICOLON_CODE) {
      this.throwError('Unexpected ";"');
    }
  });

  const { gobbleToken, gobbleIdentifier } = Jsep.prototype;

  Jsep.prototype.gobbleToken = function stampToken() {
    this.gobbleSpaces();
    const start = this.index;
    const node = gobbleToken.call(this);
    if (node) {
      node.start ??= start;
      node.end ??= trimEnd(this.expr, this.index);
    }
    return node;
  };

  Jsep.prototype.gobbleIdentifier = function stampIdentifier() {
    const start = this.index;
    const node = gobbleIdentifier.call(this);
    node.start = start;
    node.end = this.index;
    return node;
  };
}

configure();

export function parseRaw(source: string): RawNode {
  return jsep(source) as RawNode;
}
