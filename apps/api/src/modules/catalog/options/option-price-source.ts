export type OptionPriceSourceField = 'priceCents' | 'priceCoefficientKeys';

export function findOptionPriceSourceViolation(
  priceCents: number | null,
  priceCoefficientKeys: readonly string[],
): { path: OptionPriceSourceField; message: string } | null {
  const hasKeys = priceCoefficientKeys.length > 0;

  if (priceCents !== null && hasKeys) {
    return {
      path: 'priceCents',
      message: 'priceCents must be null when priceCoefficientKeys is set',
    };
  }

  if (priceCents === null && !hasKeys) {
    return {
      path: 'priceCoefficientKeys',
      message: 'priceCoefficientKeys is required when priceCents is null',
    };
  }

  return null;
}
