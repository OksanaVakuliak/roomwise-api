import type { RoomConfiguration, RoomTypeCode } from '../schemas';

export interface RoomVariables {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly floorArea: number;
  readonly perimeter: number;
  readonly wallArea: number;
  readonly heatedFloor: boolean;
  readonly roomType: RoomTypeCode;
}

export function roomVariables(room: RoomConfiguration): RoomVariables {
  const perimeter = 2 * (room.lengthM + room.widthM);
  return {
    length: room.lengthM,
    width: room.widthM,
    height: room.heightM,
    floorArea: room.lengthM * room.widthM,
    perimeter,
    wallArea: perimeter * room.heightM,
    heatedFloor: room.heatedFloor,
    roomType: room.roomTypeCode,
  };
}
