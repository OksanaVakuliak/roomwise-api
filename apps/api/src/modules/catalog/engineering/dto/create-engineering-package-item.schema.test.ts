import { describe, expect, it } from 'vitest';
import { OptionUnit } from '../../../../generated/prisma/enums';
import { createEngineeringPackageItemSchema } from './create-engineering-package-item.schema';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: { en: 'Electrical wiring', uk: 'Електропроводка' },
    description: { en: 'Base wiring package', uk: 'Базовий пакет проводки' },
    includedInBase: false,
    priceCents: 1500,
    unit: OptionUnit.PIECE,
    ...overrides,
  };
}

describe('createEngineeringPackageItemSchema', () => {
  it('accepts a non-base item with a price and unit', () => {
    const result = createEngineeringPackageItemSchema.safeParse(validPayload());

    expect(result.success).toBe(true);
  });

  it('accepts a base item without a price or unit', () => {
    const result = createEngineeringPackageItemSchema.safeParse(
      validPayload({
        includedInBase: true,
        priceCents: undefined,
        unit: undefined,
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects an unknown field', () => {
    const result = createEngineeringPackageItemSchema.safeParse(
      validPayload({ extra: 'not allowed' }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects an explicit price on a base item', () => {
    const result = createEngineeringPackageItemSchema.safeParse(
      validPayload({ includedInBase: true, unit: undefined }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['priceCents']);
    }
  });

  it('rejects an explicit unit on a base item', () => {
    const result = createEngineeringPackageItemSchema.safeParse(
      validPayload({ includedInBase: true, priceCents: undefined }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['unit']);
    }
  });
});
