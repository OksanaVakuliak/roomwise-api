import { PublicationStatus } from '../../../../generated/prisma/enums';
import type {
  SeedStyle,
  SeedStyleDefaultMaterial,
} from '../catalog-dataset.schema';
import { categoryIds } from './categories';
import { seedImages } from './images';
import { productIds } from './products';
import { roomTypeIds, roomTypes } from './room-types';

export const styleIds = {
  scandinavian: 'c68a23a2-ca4f-4fcf-a0f6-69e6019ff91b',
  loft: 'c1cebbf4-0acb-43df-9074-d4d3d7de9392',
  classic: '383be0f1-c52c-4eb8-a4b5-cad58c82056a',
} as const;

type DefaultProductByCategory = Record<string, string>;
type RoomTypeOverrides = Record<string, Record<string, string | null>>;

function buildDefaultMaterials(
  defaultByCategory: DefaultProductByCategory,
  overrides: RoomTypeOverrides,
): SeedStyleDefaultMaterial[] {
  return roomTypes.flatMap((roomType) =>
    roomType.categoryIds.flatMap((categoryId) => {
      const override = overrides[roomType.id]?.[categoryId];
      const productId =
        override === undefined ? defaultByCategory[categoryId] : override;

      return productId
        ? [{ roomTypeId: roomType.id, categoryId, productId }]
        : [];
    }),
  );
}

const scandinavianDefaultMaterials = buildDefaultMaterials(
  {
    [categoryIds.floorCovering]: productIds.whiteOakParquetPlank,
    [categoryIds.wallPaint]: productIds.whiteMatteWallPaint,
    [categoryIds.wallpaper]: productIds.lightLinenWallpaper,
    [categoryIds.wallTile]: productIds.whiteGlossyWallTile,
    [categoryIds.floorTile]: productIds.whiteMattePorcelainFloorTile,
    [categoryIds.ceilingFinish]: productIds.whiteMatteCeilingPaint,
    [categoryIds.skirtingBoards]: productIds.lightOakSkirting,
    [categoryIds.doors]: productIds.whitePaintedInteriorDoor,
    [categoryIds.lighting]: productIds.modernWhiteCeilingPendant,
    [categoryIds.plumbingFixtures]: productIds.whiteCeramicWashbasin,
  },
  {
    [roomTypeIds.kitchen]: {
      [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
    },
    [roomTypeIds.kitchenLiving]: {
      [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
    },
    [roomTypeIds.bathroom]: {
      [categoryIds.lighting]: productIds.minimalistLedCeilingLamp,
    },
  },
);

const loftDefaultMaterials = buildDefaultMaterials(
  {
    [categoryIds.floorCovering]: productIds.greySpcVinylPlank,
    [categoryIds.wallPaint]: productIds.deepGraphiteWallPaint,
    [categoryIds.wallTile]: productIds.terrazzoEffectWallTile,
    [categoryIds.floorTile]: productIds.rawConcreteEffectFloorTile,
    [categoryIds.ceilingFinish]: productIds.darkSlatMdfCeilingPanel,
    [categoryIds.skirtingBoards]: productIds.graphiteSkirting,
    [categoryIds.doors]: productIds.greyMatteInteriorDoor,
    [categoryIds.lighting]: productIds.industrialBlackWallSconce,
    [categoryIds.plumbingFixtures]: productIds.whiteCeramicWashbasin,
  },
  {
    [roomTypeIds.bedroom]: {
      [categoryIds.ceilingFinish]: productIds.greySuspendedCeilingPaint,
      [categoryIds.lighting]: productIds.matteBlackPendantLamp,
    },
    [roomTypeIds.kitchen]: {
      [categoryIds.ceilingFinish]: productIds.greySuspendedCeilingPaint,
      [categoryIds.lighting]: productIds.hangingIndustrialPendant,
      [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
    },
    [roomTypeIds.kitchenLiving]: {
      [categoryIds.wallTile]: null,
      [categoryIds.lighting]: productIds.hangingIndustrialPendant,
      [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
    },
    [roomTypeIds.bathroom]: {
      [categoryIds.ceilingFinish]: productIds.greySuspendedCeilingPaint,
      [categoryIds.lighting]: productIds.minimalistLedCeilingLamp,
    },
  },
);

const classicDefaultMaterials = buildDefaultMaterials(
  {
    [categoryIds.floorCovering]: productIds.herringboneOakParquet,
    [categoryIds.wallPaint]: productIds.warmBeigeWallPaint,
    [categoryIds.wallpaper]: productIds.vintageFloralWallpaper,
    [categoryIds.wallTile]: productIds.beigeMarbleWallTile,
    [categoryIds.floorTile]: productIds.beigeMarbleFloorTile,
    [categoryIds.ceilingFinish]: productIds.texturedPlasterCeilingFinish,
    [categoryIds.skirtingBoards]: productIds.classicWhiteSkirting,
    [categoryIds.doors]: productIds.naturalOakVeneerDoor,
    [categoryIds.lighting]: productIds.brassWallSconce,
    [categoryIds.plumbingFixtures]: productIds.whiteCeramicWashbasin,
  },
  {
    [roomTypeIds.bedroom]: { [categoryIds.wallPaint]: null },
    [roomTypeIds.kitchen]: {
      [categoryIds.ceilingFinish]: productIds.warmWhiteCeilingPaint,
      [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
    },
    [roomTypeIds.kitchenLiving]: {
      [categoryIds.floorTile]: null,
      [categoryIds.wallpaper]: null,
      [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
    },
    [roomTypeIds.bathroom]: {
      [categoryIds.ceilingFinish]: productIds.warmWhiteCeilingPaint,
      [categoryIds.lighting]: productIds.minimalistLedCeilingLamp,
    },
  },
);

export const styles: SeedStyle[] = [
  {
    id: styleIds.scandinavian,
    name: { en: 'Scandinavian', uk: 'Скандинавський' },
    description: {
      en: 'Light woods, white walls and soft natural textures for an airy, calm home.',
      uk: 'Світле дерево, білі стіни та м’які натуральні текстури для легкого й спокійного дому.',
    },
    imageId: seedImages.scandinavianStyleCover.id,
    sortOrder: 0,
    status: PublicationStatus.PUBLISHED,
    defaultMaterials: scandinavianDefaultMaterials,
  },
  {
    id: styleIds.loft,
    name: { en: 'Loft', uk: 'Лофт' },
    description: {
      en: 'Raw concrete, graphite walls and industrial metal fixtures for an urban warehouse feel.',
      uk: 'Необроблений бетон, графітові стіни та індустріальна металева фурнітура у стилі промислового приміщення.',
    },
    imageId: seedImages.loftStyleCover.id,
    sortOrder: 1,
    status: PublicationStatus.PUBLISHED,
    defaultMaterials: loftDefaultMaterials,
  },
  {
    id: styleIds.classic,
    name: { en: 'Classic', uk: 'Класика' },
    description: {
      en: 'Warm beige tones, herringbone oak floors and ornate wallpaper for a timeless interior.',
      uk: 'Теплі бежеві тони, дубовий паркет "ялинка" та візерунчасті шпалери для позачасового інтер’єру.',
    },
    imageId: seedImages.classicStyleCover.id,
    sortOrder: 2,
    status: PublicationStatus.PUBLISHED,
    defaultMaterials: classicDefaultMaterials,
  },
];
