import { describe, expect, it } from 'vitest';
import { isLocalDatabaseUrl } from './database-url';

describe('isLocalDatabaseUrl', () => {
  it('accepts localhost', () => {
    expect(isLocalDatabaseUrl('postgresql://user:pass@localhost:5432/db')).toBe(
      true,
    );
  });

  it('accepts the loopback IPv4 address', () => {
    expect(isLocalDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/db')).toBe(
      true,
    );
  });

  it('accepts the loopback IPv6 address', () => {
    expect(isLocalDatabaseUrl('postgresql://user:pass@[::1]:5432/db')).toBe(
      true,
    );
  });

  it('rejects a remote host', () => {
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@example.neon.tech/db'),
    ).toBe(false);
  });

  it('returns false for a URL that is not parseable', () => {
    expect(isLocalDatabaseUrl('not-a-url')).toBe(false);
  });
});
