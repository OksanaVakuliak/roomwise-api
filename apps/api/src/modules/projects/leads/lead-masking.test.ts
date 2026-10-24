import { describe, expect, it } from 'vitest';
import { maskEmail, maskName, maskPhone } from './lead-masking';

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
