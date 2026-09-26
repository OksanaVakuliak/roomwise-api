import { describe, expect, it } from 'vitest';
import { assertZeroPriceConfirmed } from './assert-zero-price-confirmed';

describe('assertZeroPriceConfirmed', () => {
  it('throws ZERO_PRICE_NOT_CONFIRMED for a zero price without confirmation', () => {
    expect(() => assertZeroPriceConfirmed(0, false)).toThrow(
      expect.objectContaining({ code: 'ZERO_PRICE_NOT_CONFIRMED' }),
    );
    expect(() => assertZeroPriceConfirmed(0, undefined)).toThrow(
      expect.objectContaining({ code: 'ZERO_PRICE_NOT_CONFIRMED' }),
    );
  });

  it('allows a zero price when confirmed', () => {
    expect(() => assertZeroPriceConfirmed(0, true)).not.toThrow();
  });

  it('allows a non-zero price regardless of confirmation', () => {
    expect(() => assertZeroPriceConfirmed(1500, false)).not.toThrow();
    expect(() => assertZeroPriceConfirmed(1500, undefined)).not.toThrow();
  });
});
