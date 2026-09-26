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

const scandinavianDefaultProductByCategory: Record<string, string> = {
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
};

const scandinavianRoomTypeOverrides: Record<string, Record<string, string>> = {
  [roomTypeIds.kitchen]: {
    [categoryIds.plumbingFixtures]: productIds.stainlessKitchenSink,
  },
};

function buildScandinavianDefaultMaterials(): SeedStyleDefaultMaterial[] {
  return roomTypes.flatMap((roomType) =>
    roomType.categoryIds.map((categoryId) => {
      const override = scandinavianRoomTypeOverrides[roomType.id]?.[categoryId];
      const productId =
        override ?? scandinavianDefaultProductByCategory[categoryId];

      return { roomTypeId: roomType.id, categoryId, productId };
    }),
  );
}

const loftDefaultMaterials: SeedStyleDefaultMaterial[] = [
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.floorCovering,
    productId: productIds.greySpcVinylPlank,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.wallPaint,
    productId: productIds.deepGraphiteWallPaint,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.ceilingFinish,
    productId: productIds.darkSlatMdfCeilingPanel,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.doors,
    productId: productIds.greyMatteInteriorDoor,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.lighting,
    productId: productIds.industrialBlackWallSconce,
  },
  {
    roomTypeId: roomTypeIds.bedroom,
    categoryId: categoryIds.floorCovering,
    productId: productIds.greySpcVinylPlank,
  },
  {
    roomTypeId: roomTypeIds.bedroom,
    categoryId: categoryIds.wallPaint,
    productId: productIds.deepGraphiteWallPaint,
  },
  {
    roomTypeId: roomTypeIds.kitchen,
    categoryId: categoryIds.floorTile,
    productId: productIds.rawConcreteEffectFloorTile,
  },
  {
    roomTypeId: roomTypeIds.kitchen,
    categoryId: categoryIds.wallTile,
    productId: productIds.terrazzoEffectWallTile,
  },
  {
    roomTypeId: roomTypeIds.kitchen,
    categoryId: categoryIds.wallPaint,
    productId: productIds.deepGraphiteWallPaint,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.floorCovering,
    productId: productIds.greySpcVinylPlank,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.floorTile,
    productId: productIds.rawConcreteEffectFloorTile,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.wallPaint,
    productId: productIds.deepGraphiteWallPaint,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.lighting,
    productId: productIds.hangingIndustrialPendant,
  },
  {
    roomTypeId: roomTypeIds.bathroom,
    categoryId: categoryIds.floorTile,
    productId: productIds.rawConcreteEffectFloorTile,
  },
  {
    roomTypeId: roomTypeIds.bathroom,
    categoryId: categoryIds.wallTile,
    productId: productIds.terrazzoEffectWallTile,
  },
];

const classicDefaultMaterials: SeedStyleDefaultMaterial[] = [
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.floorCovering,
    productId: productIds.herringboneOakParquet,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.wallPaint,
    productId: productIds.warmBeigeWallPaint,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.wallpaper,
    productId: productIds.vintageFloralWallpaper,
  },
  {
    roomTypeId: roomTypeIds.livingRoom,
    categoryId: categoryIds.ceilingFinish,
    productId: productIds.texturedPlasterCeilingFinish,
  },
  {
    roomTypeId: roomTypeIds.bedroom,
    categoryId: categoryIds.floorCovering,
    productId: productIds.herringboneOakParquet,
  },
  {
    roomTypeId: roomTypeIds.bedroom,
    categoryId: categoryIds.wallpaper,
    productId: productIds.vintageFloralWallpaper,
  },
  {
    roomTypeId: roomTypeIds.bedroom,
    categoryId: categoryIds.skirtingBoards,
    productId: productIds.classicWhiteSkirting,
  },
  {
    roomTypeId: roomTypeIds.kitchen,
    categoryId: categoryIds.wallTile,
    productId: productIds.beigeMarbleWallTile,
  },
  {
    roomTypeId: roomTypeIds.kitchen,
    categoryId: categoryIds.floorTile,
    productId: productIds.beigeMarbleFloorTile,
  },
  {
    roomTypeId: roomTypeIds.kitchen,
    categoryId: categoryIds.wallPaint,
    productId: productIds.warmBeigeWallPaint,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.floorCovering,
    productId: productIds.herringboneOakParquet,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.wallPaint,
    productId: productIds.warmBeigeWallPaint,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.wallTile,
    productId: productIds.beigeMarbleWallTile,
  },
  {
    roomTypeId: roomTypeIds.kitchenLiving,
    categoryId: categoryIds.lighting,
    productId: productIds.brassWallSconce,
  },
  {
    roomTypeId: roomTypeIds.bathroom,
    categoryId: categoryIds.floorTile,
    productId: productIds.beigeMarbleFloorTile,
  },
  {
    roomTypeId: roomTypeIds.bathroom,
    categoryId: categoryIds.wallTile,
    productId: productIds.beigeMarbleWallTile,
  },
  {
    roomTypeId: roomTypeIds.bathroom,
    categoryId: categoryIds.doors,
    productId: productIds.naturalOakVeneerDoor,
  },
];

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
    defaultMaterials: buildScandinavianDefaultMaterials(),
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
