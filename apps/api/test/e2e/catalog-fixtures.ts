import type { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  ProductUnit,
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../src/generated/prisma/client';

interface LocalizedText {
  en: string;
  uk: string;
  [key: string]: string;
}

function localized(en: string, uk: string): LocalizedText {
  return { en, uk };
}

const WASTE_PERCENT = 10;
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 600;
const IMAGE_BYTES = 102_400;
const PRICE_CENTS = 129_900;
const TILE_SIZE_MM = 600;
const ROOM_TYPE_SORT_ORDER = 1;
const CATEGORY_SORT_ORDER = 1;
const PRODUCT_IMAGE_SORT_ORDER = 1;
const STYLE_SORT_ORDER = 1;

export interface CatalogFixtureIds {
  roomTypeId: string;
  categoryId: string;
  materialTypeId: string;
  imageId: string;
  productId: string;
  styleId: string;
}

export async function createCatalogFixtures(
  prisma: PrismaService,
): Promise<CatalogFixtureIds> {
  const uniqueSuffix = Date.now().toString(36);

  const materialType = await prisma.materialType.create({
    data: {
      code: `ceramic-tile-${uniqueSuffix}`,
      name: localized('Ceramic Tile', 'Керамічна плитка'),
      status: PublicationStatus.PUBLISHED,
    },
  });

  const category = await prisma.category.create({
    data: {
      name: localized('Flooring', 'Підлогове покриття'),
      wastePercent: WASTE_PERCENT,
      surface: SurfaceKind.FLOOR,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const roomType = await prisma.roomType.create({
    data: {
      code: RoomTypeCode.LIVING_ROOM,
      name: localized('Living Room', 'Вітальня'),
      sortOrder: ROOM_TYPE_SORT_ORDER,
    },
  });

  await prisma.roomTypeCategory.create({
    data: {
      roomTypeId: roomType.id,
      categoryId: category.id,
      sortOrder: CATEGORY_SORT_ORDER,
    },
  });

  const image = await prisma.image.create({
    data: {
      publicId: `catalog-fixture-${uniqueSuffix}`,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      bytes: IMAGE_BYTES,
      format: 'jpg',
    },
  });

  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      materialTypeId: materialType.id,
      name: localized('Classic Ceramic Tile', 'Класична керамічна плитка'),
      description: localized(
        'A durable ceramic floor tile.',
        'Міцна керамічна плитка для підлоги.',
      ),
      brand: 'Roomwise',
      manufacturer: 'Roomwise Manufacturing',
      color: localized('White', 'Білий'),
      size: localized('600x600 mm', '600x600 мм'),
      priceCents: PRICE_CENTS,
      unit: ProductUnit.SQM,
      textureImageId: image.id,
      tileWidthMm: TILE_SIZE_MM,
      tileLengthMm: TILE_SIZE_MM,
      fallbackColor: '#F5F5F0',
      status: PublicationStatus.PUBLISHED,
    },
  });

  await prisma.productImage.create({
    data: {
      productId: product.id,
      imageId: image.id,
      sortOrder: PRODUCT_IMAGE_SORT_ORDER,
      isPrimary: true,
    },
  });

  const style = await prisma.style.create({
    data: {
      name: localized('Scandinavian', 'Скандинавський'),
      description: localized(
        'Light and minimal.',
        'Світлий і мінімалістичний.',
      ),
      imageId: image.id,
      sortOrder: STYLE_SORT_ORDER,
      status: PublicationStatus.PUBLISHED,
    },
  });

  await prisma.styleDefaultMaterial.create({
    data: {
      styleId: style.id,
      roomTypeId: roomType.id,
      categoryId: category.id,
      productId: product.id,
    },
  });

  return {
    roomTypeId: roomType.id,
    categoryId: category.id,
    materialTypeId: materialType.id,
    imageId: image.id,
    productId: product.id,
    styleId: style.id,
  };
}
