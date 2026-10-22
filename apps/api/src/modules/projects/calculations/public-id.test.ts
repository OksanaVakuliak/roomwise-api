import { describe, expect, it } from 'vitest';
import { generatePublicId } from './public-id';

describe('generatePublicId', () => {
  it('returns 22 base64url characters', () => {
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('returns a different value on each call', () => {
    expect(generatePublicId()).not.toBe(generatePublicId());
  });
});
