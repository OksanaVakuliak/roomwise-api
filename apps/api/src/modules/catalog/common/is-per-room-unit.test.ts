import { describe, expect, it } from 'vitest';
import { OptionUnit } from '../../../generated/prisma/enums';
import { isPerRoomUnit } from './is-per-room-unit';

describe('isPerRoomUnit', () => {
  it('returns true for ROOM_SQM', () => {
    expect(isPerRoomUnit(OptionUnit.ROOM_SQM)).toBe(true);
  });

  it('returns true for ROOM', () => {
    expect(isPerRoomUnit(OptionUnit.ROOM)).toBe(true);
  });

  it('returns false for PIECE', () => {
    expect(isPerRoomUnit(OptionUnit.PIECE)).toBe(false);
  });

  it('returns false for PROJECT', () => {
    expect(isPerRoomUnit(OptionUnit.PROJECT)).toBe(false);
  });
});
