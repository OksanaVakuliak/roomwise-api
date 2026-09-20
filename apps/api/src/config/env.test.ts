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
});
