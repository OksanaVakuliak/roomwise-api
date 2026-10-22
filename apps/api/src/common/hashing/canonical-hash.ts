import { createHash } from 'node:crypto';

const VERSION_LENGTH = 16;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')
    .slice(0, VERSION_LENGTH);
}
