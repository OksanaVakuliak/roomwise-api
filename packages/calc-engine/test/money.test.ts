import { describe, expect, it } from 'vitest';
import { convertCentsToKopecks, toCents } from '../src/money';

describe('toCents', () => {
  it('rounds binary noise cases half up', () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.125)).toBe(13);
    expect(toCents(2.675)).toBe(268);
  });

  it('keeps exact values', () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(420)).toBe(42000);
  });

  it('rounds below half down', () => {
    expect(toCents(0.004)).toBe(0);
    expect(toCents(1.0049)).toBe(100);
  });

  it('rejects negative and non-finite values', () => {
    expect(() => toCents(-0.01)).toThrow(RangeError);
    expect(() => toCents(Number.NaN)).toThrow(RangeError);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => toCents(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('handles large sums without losing precision', () => {
    expect(toCents(1_000_000_000)).toBe(100_000_000_000);
    expect(toCents(12_345_678_901.23)).toBe(1_234_567_890_123);
  });

  it('rejects results beyond the safe integer range', () => {
    expect(() => toCents(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});

describe('convertCentsToKopecks', () => {
  it('converts with a four-decimal rate', () => {
    expect(convertCentsToKopecks(10000, '41.2345')).toBe(412345);
    expect(convertCentsToKopecks(1, '44.5483')).toBe(45);
    expect(convertCentsToKopecks(42000, 41.2345)).toBe(1731849);
  });

  it('accepts integer and short-decimal rates', () => {
    expect(convertCentsToKopecks(100, 40)).toBe(4000);
    expect(convertCentsToKopecks(100, '41.5')).toBe(4150);
  });

  it('rounds kopecks half up', () => {
    expect(convertCentsToKopecks(1, '0.5')).toBe(1);
    expect(convertCentsToKopecks(1, '0.4999')).toBe(0);
    expect(convertCentsToKopecks(3, '0.1667')).toBe(1);
    expect(convertCentsToKopecks(1, '1.5')).toBe(2);
    expect(convertCentsToKopecks(1, '2.5')).toBe(3);
  });

  it('returns zero for zero cents', () => {
    expect(convertCentsToKopecks(0, '41.2345')).toBe(0);
  });

  it('is exact for large amounts', () => {
    expect(convertCentsToKopecks(100_000_000_000, '44.5483')).toBe(
      4_454_830_000_000,
    );
  });

  it('rejects invalid cents', () => {
    expect(() => convertCentsToKopecks(-1, '41')).toThrow(RangeError);
    expect(() => convertCentsToKopecks(1.5, '41')).toThrow(RangeError);
    expect(() => convertCentsToKopecks(Number.NaN, '41')).toThrow(RangeError);
    expect(() => convertCentsToKopecks(Number.POSITIVE_INFINITY, '41')).toThrow(
      RangeError,
    );
  });

  it('rejects invalid rates', () => {
    expect(() => convertCentsToKopecks(100, 0)).toThrow(RangeError);
    expect(() => convertCentsToKopecks(100, '0.0000')).toThrow(RangeError);
    expect(() => convertCentsToKopecks(100, -41)).toThrow(RangeError);
    expect(() => convertCentsToKopecks(100, '41.12345')).toThrow(RangeError);
    expect(() => convertCentsToKopecks(100, Number.NaN)).toThrow(RangeError);
    expect(() => convertCentsToKopecks(100, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
    expect(() => convertCentsToKopecks(100, 'abc')).toThrow(RangeError);
    expect(() => convertCentsToKopecks(100, '1e3')).toThrow(RangeError);
  });
});
