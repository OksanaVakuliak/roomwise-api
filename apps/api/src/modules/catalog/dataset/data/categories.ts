import {
  PublicationStatus,
  SurfaceKind,
} from '../../../../generated/prisma/enums';
import type { SeedCategory } from '../catalog-dataset.schema';

export const categoryIds = {
  floorCovering: 'a02f1429-4d77-49eb-a43d-52dcb2426d9f',
  wallPaint: '715411d8-63c7-4b6e-99dd-f03782c8b2f3',
  wallpaper: '2d0ea439-be0e-44ac-bc20-269dd47a3318',
  wallTile: 'ffc93df3-13b8-440a-a0d1-9cf2bc2ed941',
  floorTile: 'fbab82c2-ccab-4f6d-b131-7195993a5346',
  ceilingFinish: 'e3eb686d-ef3d-4b76-a1ab-23b21052d543',
  skirtingBoards: 'fb7fb100-7fc8-40ff-a015-2d22883e088e',
  doors: '5fe2749d-d2da-42b6-8a2a-28f6c3ebbb80',
  lighting: '427d2da3-8693-4588-850b-428fd120fa1a',
  plumbingFixtures: 'f13be20a-8830-488b-a38e-d8330e456b7c',
} as const;

export const categories: SeedCategory[] = [
  {
    id: categoryIds.floorCovering,
    name: { en: 'Floor covering', uk: 'Підлогове покриття' },
    wastePercent: 10,
    surface: SurfaceKind.FLOOR,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.wallPaint,
    name: { en: 'Wall paint', uk: 'Фарба для стін' },
    wastePercent: 5,
    surface: SurfaceKind.WALLS,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.wallpaper,
    name: { en: 'Wallpaper', uk: 'Шпалери' },
    wastePercent: 10,
    surface: SurfaceKind.WALLS,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.wallTile,
    name: { en: 'Wall tile', uk: 'Настінна плитка' },
    wastePercent: 12,
    surface: SurfaceKind.WALLS,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.floorTile,
    name: { en: 'Floor tile', uk: 'Підлогова плитка' },
    wastePercent: 12,
    surface: SurfaceKind.FLOOR,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.ceilingFinish,
    name: { en: 'Ceiling finish', uk: 'Оздоблення стелі' },
    wastePercent: 5,
    surface: SurfaceKind.CEILING,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.skirtingBoards,
    name: { en: 'Skirting boards', uk: 'Плінтуси' },
    wastePercent: 5,
    surface: SurfaceKind.NONE,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.doors,
    name: { en: 'Doors', uk: 'Двері' },
    wastePercent: 0,
    surface: SurfaceKind.NONE,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.lighting,
    name: { en: 'Lighting fixtures', uk: 'Освітлювальні прилади' },
    wastePercent: 0,
    surface: SurfaceKind.NONE,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: categoryIds.plumbingFixtures,
    name: { en: 'Plumbing fixtures', uk: 'Сантехніка' },
    wastePercent: 0,
    surface: SurfaceKind.NONE,
    status: PublicationStatus.PUBLISHED,
  },
];
