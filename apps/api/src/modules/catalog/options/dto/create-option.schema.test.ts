import { describe, expect, it } from 'vitest';
import { OptionKind, OptionUnit } from '../../../../generated/prisma/enums';
import { createOptionSchema, roomTypeIdsSchema } from './create-option.schema';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    kind: OptionKind.ENGINEERING,
    name: { en: 'Heated floor', uk: 'Тепла підлога' },
    description: { en: 'Warms the floor', uk: 'Обігрів підлоги' },
    priceCents: 3500,
    confirmZeroPrice: false,
    unit: OptionUnit.PROJECT,
    roomTypeIds: [] as string[],
    ...overrides,
  };
}

describe('roomTypeIdsSchema', () => {
  it('accepts distinct ids', () => {
    const result = roomTypeIdsSchema.safeParse([
      crypto.randomUUID(),
      crypto.randomUUID(),
    ]);

    expect(result.success).toBe(true);
  });

  it('rejects a repeated id', () => {
    const roomTypeId = crypto.randomUUID();

    const result = roomTypeIdsSchema.safeParse([roomTypeId, roomTypeId]);

    expect(result.success).toBe(false);
  });
});

describe('createOptionSchema', () => {
  it('rejects duplicate roomTypeIds with a validation error on roomTypeIds', () => {
    const roomTypeId = crypto.randomUUID();

    const result = createOptionSchema.safeParse(
      baseInput({
        unit: OptionUnit.ROOM_SQM,
        roomTypeIds: [roomTypeId, roomTypeId],
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['roomTypeIds']);
    }
  });

  it('rejects minQuantity greater than maxQuantity with an error on maxQuantity', () => {
    const result = createOptionSchema.safeParse(
      baseInput({
        unit: OptionUnit.PIECE,
        minQuantity: 5,
        maxQuantity: 2,
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['maxQuantity']);
    }
  });

  it('accepts minQuantity equal to maxQuantity', () => {
    const result = createOptionSchema.safeParse(
      baseInput({
        unit: OptionUnit.PIECE,
        minQuantity: 3,
        maxQuantity: 3,
      }),
    );

    expect(result.success).toBe(true);
  });

  it('accepts a valid option without quantity bounds', () => {
    const result = createOptionSchema.safeParse(baseInput());

    expect(result.success).toBe(true);
  });
});
