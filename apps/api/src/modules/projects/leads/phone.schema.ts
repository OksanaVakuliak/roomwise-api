import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const parsed = trimmed.startsWith('+')
    ? parsePhoneNumberFromString(trimmed)
    : undefined;

  if (parsed?.isValid()) {
    return parsed.number;
  }

  throw new AppError(ERROR_CODES.PHONE_INVALID, {
    fields: [{ path: 'phone', code: ERROR_CODES.PHONE_INVALID }],
  });
}
