export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new RangeError(`Invalid dollar amount: ${dollars}`);
  }
  const cents = Math.round(Number((dollars * 100).toPrecision(15)));
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount exceeds the safe integer range: ${dollars}`);
  }
  return cents;
}
