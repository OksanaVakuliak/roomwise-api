import type {
  Configuration,
  FinishLevel,
  RoomTypeCode,
  Scope,
} from '../schemas';
import { roomVariables } from './room';

export interface ObjectVariables {
  readonly scope: Scope;
  readonly totalArea: number;
  readonly balconyArea: number;
  readonly balconyTiles: boolean;
  readonly finishLevel: FinishLevel;
  readonly roomsCount: number;
  readonly bathroomsCount: number;
  readonly roomsFloorArea: number;
  readonly roomsWallArea: number;
  readonly roomsPerimeter: number;
  readonly wetRoomsCount: number;
}

const COUNTED_AS_ROOMS: readonly RoomTypeCode[] = [
  'LIVING_ROOM',
  'BEDROOM',
  'KITCHEN_LIVING',
];

const WET_ROOMS: readonly RoomTypeCode[] = [
  'BATHROOM',
  'KITCHEN',
  'KITCHEN_LIVING',
];

export function totalAreaOf(
  scope: Scope,
  totalAreaSqm: number | null,
  roomsFloorArea: number,
): number {
  return scope === 'PARTIAL' || totalAreaSqm === null
    ? roomsFloorArea
    : totalAreaSqm;
}

export function objectVariables(configuration: Configuration): ObjectVariables {
  const rooms = configuration.rooms.map(roomVariables);
  const sum = (pick: (room: (typeof rooms)[number]) => number): number =>
    rooms.reduce((total, room) => total + pick(room), 0);
  const roomsFloorArea = sum((room) => room.floorArea);
  return {
    scope: configuration.scope,
    totalArea: totalAreaOf(
      configuration.scope,
      configuration.totalAreaSqm,
      roomsFloorArea,
    ),
    balconyArea: configuration.balconyAreaSqm,
    balconyTiles: configuration.balconyTiles,
    finishLevel: configuration.finishLevel,
    roomsCount: configuration.rooms.filter((room) =>
      COUNTED_AS_ROOMS.includes(room.roomTypeCode),
    ).length,
    bathroomsCount: configuration.rooms.filter(
      (room) => room.roomTypeCode === 'BATHROOM',
    ).length,
    roomsFloorArea,
    roomsWallArea: sum((room) => room.wallArea),
    roomsPerimeter: sum((room) => room.perimeter),
    wetRoomsCount: rooms.filter((room) => WET_ROOMS.includes(room.roomType))
      .length,
  };
}
