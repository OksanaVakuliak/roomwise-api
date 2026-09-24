import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgresql://roomwise:roomwise@localhost:5432/roomwise',
  DIRECT_URL: 'postgresql://roomwise:roomwise@localhost:5432/roomwise',
  JWT_SECRET: 'j'.repeat(32),
  CORS_ORIGIN: 'http://localhost:3000, https://roomwise.example.com',
  CLOUDINARY_URL: 'cloudinary://key:secret@example',
  MAINTENANCE_TOKEN: 'm'.repeat(32),
  DEMO_ADMIN_LOGIN: 'demo',
  DEMO_ADMIN_PASSWORD: 'demo-password',
  SANDBOX_RESET_TIME: '03:00',
  SANDBOX_TIMEZONE: 'Europe/Kyiv',
  PORT: '4000',
};

describe('validateEnv', () => {
  it('parses and types valid environment values', () => {
    const env = validateEnv(validEnv);

    expect(env.CORS_ORIGIN).toEqual([
      'http://localhost:3000',
      'https://roomwise.example.com',
    ]);
    expect(env.PORT).toBe(4000);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('reports every missing or invalid field without exposing values', () => {
    expect(() => validateEnv({ DATABASE_URL: 'secret-value' })).toThrowError(
      EnvValidationError,
    );

    try {
      validateEnv({ DATABASE_URL: 'secret-value' });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).fields).toContain('DIRECT_URL');
      expect((error as Error).message).not.toContain('secret-value');
    }
  });

  it('treats an empty NODE_ENV as unset and applies the default', () => {
    const env = validateEnv({ ...validEnv, NODE_ENV: '' });

    expect(env.NODE_ENV).toBe('development');
  });

  it('treats an empty PORT as unset and applies the default', () => {
    const env = validateEnv({ ...validEnv, PORT: '' });

    expect(env.PORT).toBe(3000);
  });

  it('applies both defaults when NODE_ENV and PORT are missing', () => {
    const { PORT, ...rest } = validEnv;
    const env = validateEnv(rest);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('rejects an unknown NODE_ENV value', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'banana' })).toThrowError(
      EnvValidationError,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrowError(
      EnvValidationError,
    );
  });

  it('rejects a PORT of 0', () => {
    expect(() => validateEnv({ ...validEnv, PORT: '0' })).toThrowError(
      EnvValidationError,
    );
  });

  it('accepts an explicit NODE_ENV and PORT', () => {
    const env = validateEnv({
      ...validEnv,
      NODE_ENV: 'production',
      PORT: '8080',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
  });

  it('defaults TRUST_PROXY_HOPS to 1 when absent', () => {
    const env = validateEnv(validEnv);

    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('treats an empty TRUST_PROXY_HOPS as unset and applies the default', () => {
    const env = validateEnv({ ...validEnv, TRUST_PROXY_HOPS: '' });

    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('parses an explicit TRUST_PROXY_HOPS', () => {
    const env = validateEnv({ ...validEnv, TRUST_PROXY_HOPS: '2' });

    expect(env.TRUST_PROXY_HOPS).toBe(2);
  });

  it('rejects a negative TRUST_PROXY_HOPS', () => {
    expect(() =>
      validateEnv({ ...validEnv, TRUST_PROXY_HOPS: '-1' }),
    ).toThrowError(EnvValidationError);
  });

  it('rejects a non-numeric TRUST_PROXY_HOPS', () => {
    expect(() =>
      validateEnv({ ...validEnv, TRUST_PROXY_HOPS: 'abc' }),
    ).toThrowError(EnvValidationError);
  });

  it('rejects a TRUST_PROXY_HOPS above the maximum', () => {
    expect(() =>
      validateEnv({ ...validEnv, TRUST_PROXY_HOPS: '6' }),
    ).toThrowError(EnvValidationError);
  });
});
