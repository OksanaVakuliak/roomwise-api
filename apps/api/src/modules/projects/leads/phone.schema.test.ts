import { describe, expect, it } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { normalizePhone } from './phone.schema';

function phoneError(raw: string): unknown {
  try {
    normalizePhone(raw);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('normalizePhone', () => {
  it.each([
    ['+380671234567', '+380671234567'],
    ['+380 67 123-45-67', '+380671234567'],
    ['  +380 (67) 123 45 67 ', '+380671234567'],
    ['+1 650 253 0000', '+16502530000'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    '0671234567',
    '380671234567',
    '+38067',
    '+380000000000',
    '+1 555 0100',
    '+380abc1234567',
    'phone',
  ])('rejects %s with PHONE_INVALID', (raw) => {
    const error = phoneError(raw);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ERROR_CODES.PHONE_INVALID);
  });
});
