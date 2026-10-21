import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalJson } from './canonical-hash';

describe('canonicalJson', () => {
  it('sorts object keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it('keeps array order', () => {
    expect(canonicalJson({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
  });

  it('skips undefined properties and writes undefined array items as null', () => {
    expect(canonicalJson({ a: undefined, b: [undefined, 1] })).toBe(
      '{"b":[null,1]}',
    );
  });

  it('serializes null, strings and booleans like JSON', () => {
    expect(canonicalJson({ a: null, b: 'x"y', c: true })).toBe(
      '{"a":null,"b":"x\\"y","c":true}',
    );
  });
});

describe('canonicalHash', () => {
  it('returns 16 lowercase hex characters', () => {
    expect(canonicalHash({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ignores key order', () => {
    expect(canonicalHash({ a: 1, b: [1, 2] })).toBe(
      canonicalHash({ b: [1, 2], a: 1 }),
    );
  });

  it('changes when a value changes', () => {
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
  });

  it('is stable for a known input', () => {
    expect(canonicalHash({ a: 1 })).toBe('015abd7f5cc57a2d');
  });
});
