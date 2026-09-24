import { describe, expect, it } from 'vitest';
import { parseLoginArg, validateCredentials } from './admin-cli';

describe('parseLoginArg', () => {
  it('returns the value after a separate --login flag', () => {
    expect(parseLoginArg(['--login', 'owner'])).toBe('owner');
  });

  it('returns the value from the --login=value form', () => {
    expect(parseLoginArg(['--login=owner'])).toBe('owner');
  });

  it('returns undefined when --login is missing', () => {
    expect(parseLoginArg(['--other', 'value'])).toBeUndefined();
  });

  it('returns undefined when --login has no value', () => {
    expect(parseLoginArg(['--login'])).toBeUndefined();
  });

  it('returns undefined for an empty argv', () => {
    expect(parseLoginArg([])).toBeUndefined();
  });

  it('finds --login after other flags', () => {
    expect(parseLoginArg(['--verbose', '--login', 'owner'])).toBe('owner');
  });
});

describe('validateCredentials', () => {
  it('rejects an invalid login', () => {
    const result = validateCredentials('Ow!', 'a-valid-password-123');

    expect('errors' in result).toBe(true);
  });

  it('rejects a password shorter than the minimum length', () => {
    const result = validateCredentials('owner', 'short');

    expect('errors' in result).toBe(true);
  });

  it('rejects a password longer than the maximum length', () => {
    const result = validateCredentials('owner', 'a'.repeat(129));

    expect('errors' in result).toBe(true);
  });

  it('rejects a password equal to the login, case-insensitively', () => {
    const result = validateCredentials('ownerloginid', 'OwnerLoginID');

    expect('errors' in result).toBe(true);
  });

  it('normalizes a valid login by trimming and lowercasing it', () => {
    const result = validateCredentials('  Owner  ', 'a-valid-password-123');

    expect(result).toEqual({ login: 'owner' });
  });
});
