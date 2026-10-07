const RATE_PATTERN = /^(\d+)(?:\.(\d{1,4}))?$/;
const RATE_SCALE = 10000n;

function scaleRate(rate: number | string): bigint {
  const match = RATE_PATTERN.exec(String(rate));
  if (!match) {
    throw new RangeError(`Invalid exchange rate: ${rate}`);
  }
  const scaled =
    BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? '').padEnd(4, '0'));
  if (scaled <= 0n) {
    throw new RangeError(`Invalid exchange rate: ${rate}`);
  }
  return scaled;
}

export function convertCentsToKopecks(
  cents: number,
  rate: number | string,
): number {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`Invalid cents amount: ${cents}`);
  }
  const product = BigInt(cents) * scaleRate(rate);
  const kopecks = (product + RATE_SCALE / 2n) / RATE_SCALE;
  if (kopecks > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`Amount exceeds the safe integer range: ${cents}`);
  }
  return Number(kopecks);
}
