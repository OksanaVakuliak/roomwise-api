import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hasher';

const LOW_BCRYPT_COST = 4;
const BCRYPT_INPUT_LIMIT_BYTES = 72;

describe('password hasher', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('a-valid-password-123', LOW_BCRYPT_COST);

    await expect(verifyPassword('a-valid-password-123', hash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('another-password-1', hash)).resolves.toBe(
      false,
    );
  });

  it('distinguishes passwords that differ only after the first 72 bytes', async () => {
    const sharedPrefix = 'a'.repeat(BCRYPT_INPUT_LIMIT_BYTES + 8);
    const hash = await hashPassword(`${sharedPrefix}-first`, LOW_BCRYPT_COST);

    await expect(verifyPassword(`${sharedPrefix}-second`, hash)).resolves.toBe(
      false,
    );
  });

  it('round-trips a multi-byte password', async () => {
    const password = 'Надійний-пароль-адміна';
    const hash = await hashPassword(password, LOW_BCRYPT_COST);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('Надійний-пароль-клієнта', hash)).resolves.toBe(
      false,
    );
  });

  it('uses the given bcrypt cost', async () => {
    const hash = await hashPassword('a-valid-password-123', LOW_BCRYPT_COST);

    expect(hash).toMatch(/^\$2[aby]\$04\$/);
  });
});
