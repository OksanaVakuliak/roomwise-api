import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/max';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('+') && isValidPhoneNumber(trimmed)) {
    const parsed = parsePhoneNumberFromString(trimmed);

    if (parsed) {
      return parsed.number;
    }
  }

  throw new AppError(ERROR_CODES.PHONE_INVALID, {
    fields: [{ path: 'phone', code: ERROR_CODES.PHONE_INVALID }],
  });
}
