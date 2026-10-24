import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const MASK = '•••';
const PHONE_TAIL_LENGTH = 2;

function firstCodePoint(value: string): string {
  return Array.from(value.trim())[0] ?? '';
}

export function maskName(name: string): string {
  return `${firstCodePoint(name)}${MASK}`;
}

export function maskPhone(phone: string): string {
  const countryCode = parsePhoneNumberFromString(phone)?.countryCallingCode;
  const tail = phone.replace(/\D/g, '').slice(-PHONE_TAIL_LENGTH);

  return `+${countryCode ?? ''}${MASK}${tail}`;
}

export function maskEmail(email: string | null): string | null {
  if (email === null) {
    return null;
  }

  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf('@');
  const local = atIndex === -1 ? trimmed : trimmed.slice(0, atIndex);
  const domain = atIndex === -1 ? '' : trimmed.slice(atIndex + 1);
  const topLevelDomain = domain.split('.').pop() ?? '';

  return `${firstCodePoint(local)}${MASK}@${MASK}.${topLevelDomain}`;
}
