import { describe, expect, it } from 'vitest';
import type { VersionView } from '../presenters/version-view.schema';
import {
  maskCalculationRoomNames,
  maskEmail,
  maskName,
  maskPhone,
} from './lead-masking';

describe('maskName', () => {
  it.each([
    ['Олена', 'О•••'],
    ['  Oksana', 'O•••'],
    ['X', 'X•••'],
    ['Anna Maria Smith', 'A•••'],
    ['😀 Smile', '😀•••'],
    ['', '•••'],
  ])('masks %j as %j', (input, expected) => {
    expect(maskName(input)).toBe(expected);
  });
});

describe('maskPhone', () => {
  it.each([
    ['+380671234567', '+380•••67'],
    ['+14155552671', '+1•••71'],
    ['+447911123456', '+44•••56'],
  ])('masks %s as %s', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  it('falls back to a bare mask when the country code is unknown', () => {
    expect(maskPhone('12345')).toBe('+•••45');
  });
});

describe('maskEmail', () => {
  it.each([
    ['user@mail.com', 'u•••@•••.com'],
    ['a@b.co.uk', 'a•••@•••.uk'],
    ['Олена@пошта.ua', 'О•••@•••.ua'],
    ['  spaced@example.org ', 's•••@•••.org'],
  ])('masks %j as %j', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it('keeps a missing email missing', () => {
    expect(maskEmail(null)).toBeNull();
  });
});

describe('maskCalculationRoomNames', () => {
  const view = {
    configuration: {
      rooms: [
        { clientId: 'a', name: 'Master bedroom', lengthM: 4 },
        { clientId: 'b', lengthM: 3 },
      ],
    },
    rooms: [
      { clientId: 'a', name: 'Master bedroom', roomTypeName: 'Bedroom' },
      { clientId: 'b', name: 'Kitchen', roomTypeName: 'Kitchen' },
    ],
    lines: [
      { roomClientId: 'a', roomName: 'Master bedroom' },
      { roomClientId: 'b', roomName: 'Kitchen' },
      { roomClientId: null, roomName: null },
    ],
    totals: { usdCents: 100 },
  } as unknown as VersionView;

  it('replaces custom names with the localized room type names', () => {
    const result = maskCalculationRoomNames(view);

    expect(result.rooms.map((room) => room.name)).toEqual([
      'Bedroom',
      'Kitchen',
    ]);
    expect(result.lines.map((line) => line.roomName)).toEqual([
      'Bedroom',
      'Kitchen',
      null,
    ]);
    expect(result.configuration.rooms).toEqual([
      { clientId: 'a', lengthM: 4 },
      { clientId: 'b', lengthM: 3 },
    ]);
    expect(result.totals).toEqual(view.totals);
  });

  it('does not mutate the input', () => {
    maskCalculationRoomNames(view);

    expect(view.rooms[0]?.name).toBe('Master bedroom');
    expect(view.configuration.rooms[0]?.name).toBe('Master bedroom');
  });
});
