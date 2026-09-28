import { RoomTypeCode } from '../../../../generated/prisma/enums';
import type { SeedRoomType } from '../catalog-dataset.schema';
import { categoryIds } from './categories';

export const roomTypeIds = {
  livingRoom: '216b3a24-18f4-4880-902d-43acb7198575',
  bedroom: '2b946c84-1708-4bed-906e-d02bcc42708b',
  kitchen: '3f8426da-705b-47fe-bee7-8941225f5ce9',
  kitchenLiving: '8efa46a6-9498-4f33-930f-11c38c804f13',
  bathroom: '7d56da9e-919f-425f-b54b-b7a05920bc05',
} as const;

export const roomTypes: SeedRoomType[] = [
  {
    id: roomTypeIds.livingRoom,
    code: RoomTypeCode.LIVING_ROOM,
    name: { en: 'Living room', uk: 'Вітальня' },
    sortOrder: 0,
    categoryIds: [
      categoryIds.floorCovering,
      categoryIds.wallPaint,
      categoryIds.wallpaper,
      categoryIds.ceilingFinish,
      categoryIds.skirtingBoards,
      categoryIds.doors,
      categoryIds.lighting,
    ],
  },
  {
    id: roomTypeIds.bedroom,
    code: RoomTypeCode.BEDROOM,
    name: { en: 'Bedroom', uk: 'Спальня' },
    sortOrder: 1,
    categoryIds: [
      categoryIds.floorCovering,
      categoryIds.wallPaint,
      categoryIds.wallpaper,
      categoryIds.ceilingFinish,
      categoryIds.skirtingBoards,
    ],
  },
  {
    id: roomTypeIds.kitchen,
    code: RoomTypeCode.KITCHEN,
    name: { en: 'Kitchen', uk: 'Кухня' },
    sortOrder: 2,
    categoryIds: [
      categoryIds.floorTile,
      categoryIds.wallTile,
      categoryIds.wallPaint,
      categoryIds.ceilingFinish,
      categoryIds.plumbingFixtures,
      categoryIds.lighting,
    ],
  },
  {
    id: roomTypeIds.kitchenLiving,
    code: RoomTypeCode.KITCHEN_LIVING,
    name: { en: 'Kitchen-living room', uk: 'Кухня-вітальня' },
    sortOrder: 3,
    categoryIds: [
      categoryIds.floorCovering,
      categoryIds.floorTile,
      categoryIds.wallPaint,
      categoryIds.wallTile,
      categoryIds.wallpaper,
      categoryIds.ceilingFinish,
      categoryIds.skirtingBoards,
      categoryIds.lighting,
    ],
  },
  {
    id: roomTypeIds.bathroom,
    code: RoomTypeCode.BATHROOM,
    name: { en: 'Bathroom', uk: 'Санвузол' },
    sortOrder: 4,
    categoryIds: [
      categoryIds.floorTile,
      categoryIds.wallTile,
      categoryIds.ceilingFinish,
      categoryIds.plumbingFixtures,
      categoryIds.doors,
    ],
  },
];
