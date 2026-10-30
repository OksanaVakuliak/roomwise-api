import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generatePublicId, publicIdFromUuid } from './public-id';

describe('generatePublicId', () => {
  it('returns 22 base64url characters', () => {
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('returns a different value on each call', () => {
    expect(generatePublicId()).not.toBe(generatePublicId());
  });
});

describe('publicIdFromUuid', () => {
  it('returns 22 base64url characters for a uuid', () => {
    expect(publicIdFromUuid(randomUUID())).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('is deterministic and distinct per uuid', () => {
    const uuid = randomUUID();

    expect(publicIdFromUuid(uuid)).toBe(publicIdFromUuid(uuid));
    expect(publicIdFromUuid(uuid)).not.toBe(publicIdFromUuid(randomUUID()));
  });
});
