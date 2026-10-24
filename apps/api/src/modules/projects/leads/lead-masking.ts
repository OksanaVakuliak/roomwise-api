import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { VersionView } from '../presenters/version-view.schema';

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

export function maskCalculationRoomNames(view: VersionView): VersionView {
  const typeNameByClientId = new Map(
    view.rooms.map((room) => [room.clientId, room.roomTypeName]),
  );

  return {
    ...view,
    configuration: {
      ...view.configuration,
      rooms: view.configuration.rooms.map(({ name: _name, ...room }) => room),
    },
    rooms: view.rooms.map((room) => ({ ...room, name: room.roomTypeName })),
    lines: view.lines.map((line) => ({
      ...line,
      roomName:
        (line.roomClientId === null
          ? undefined
          : typeNameByClientId.get(line.roomClientId)) ?? line.roomName,
    })),
  };
}
