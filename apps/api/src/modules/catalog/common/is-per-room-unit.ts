import { OptionUnit } from '../../../generated/prisma/enums';

export function isPerRoomUnit(unit: OptionUnit): boolean {
  return unit === OptionUnit.ROOM_SQM || unit === OptionUnit.ROOM;
}
