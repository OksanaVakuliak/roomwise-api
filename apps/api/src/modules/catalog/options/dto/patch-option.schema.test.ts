import { describe, expect, it } from 'vitest';
import { patchOptionSchema } from './patch-option.schema';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    revision: crypto.randomUUID(),
    ...overrides,
  };
}

describe('patchOptionSchema', () => {
  it('rejects duplicate roomTypeIds with a validation error on roomTypeIds', () => {
    const roomTypeId = crypto.randomUUID();

    const result = patchOptionSchema.safeParse(
      baseInput({ roomTypeIds: [roomTypeId, roomTypeId] }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['roomTypeIds']);
    }
  });

  it('rejects minQuantity greater than maxQuantity when both are patched', () => {
    const result = patchOptionSchema.safeParse(
      baseInput({ minQuantity: 5, maxQuantity: 2 }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['maxQuantity']);
    }
  });

  it('accepts patching only maxQuantity, leaving the bounds check to the service', () => {
    const result = patchOptionSchema.safeParse(baseInput({ maxQuantity: 2 }));

    expect(result.success).toBe(true);
  });

  it('accepts clearing both bounds to null', () => {
    const result = patchOptionSchema.safeParse(
      baseInput({ minQuantity: null, maxQuantity: null }),
    );

    expect(result.success).toBe(true);
  });
});
