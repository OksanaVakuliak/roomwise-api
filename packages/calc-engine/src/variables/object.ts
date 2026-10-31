import type { Configuration, FinishLevel, RoomTypeCode } from '../schemas';

export interface ObjectVariables {
  readonly totalArea: number;
  readonly balconyArea: number;
  readonly balconyTiles: boolean;
  readonly finishLevel: FinishLevel;
  readonly roomsCount: number;
  readonly bathroomsCount: number;
}

const COUNTED_AS_ROOMS: readonly RoomTypeCode[] = [
  'LIVING_ROOM',
  'BEDROOM',
  'KITCHEN_LIVING',
];

export function objectVariables(configuration: Configuration): ObjectVariables {
  return {
    totalArea: configuration.totalAreaSqm,
    balconyArea: configuration.balconyAreaSqm,
    balconyTiles: configuration.balconyTiles,
    finishLevel: configuration.finishLevel,
    roomsCount: configuration.rooms.filter((room) =>
      COUNTED_AS_ROOMS.includes(room.roomTypeCode),
    ).length,
    bathroomsCount: configuration.rooms.filter(
      (room) => room.roomTypeCode === 'BATHROOM',
    ).length,
  };
}
