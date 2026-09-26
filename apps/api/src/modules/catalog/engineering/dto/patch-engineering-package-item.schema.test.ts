import { describe, expect, it } from 'vitest';
import { OptionUnit } from '../../../../generated/prisma/enums';
import { patchEngineeringPackageItemSchema } from './patch-engineering-package-item.schema';

const REVISION = '00000000-0000-4000-8000-000000000000';

describe('patchEngineeringPackageItemSchema', () => {
  it('accepts a partial patch without price or unit conflicts', () => {
    const result = patchEngineeringPackageItemSchema.safeParse({
      includedInBase: true,
      revision: REVISION,
    });

    expect(result.success).toBe(true);
  });

  it('accepts clearing the price and unit while including an item', () => {
    const result = patchEngineeringPackageItemSchema.safeParse({
      includedInBase: true,
      priceCents: null,
      unit: null,
      revision: REVISION,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown field', () => {
    const result = patchEngineeringPackageItemSchema.safeParse({
      revision: REVISION,
      extra: 'not allowed',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an explicit price alongside includedInBase: true in the same payload', () => {
    const result = patchEngineeringPackageItemSchema.safeParse({
      includedInBase: true,
      priceCents: 500,
      revision: REVISION,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['priceCents']);
    }
  });

  it('rejects an explicit unit alongside includedInBase: true in the same payload', () => {
    const result = patchEngineeringPackageItemSchema.safeParse({
      includedInBase: true,
      unit: OptionUnit.PIECE,
      revision: REVISION,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['unit']);
    }
  });
});
