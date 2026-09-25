import { randomUUID } from 'node:crypto';
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

const DEFAULT_WASTE_PERCENT = 10;
const DEFAULT_PRICE_CENTS = 150_000;
const DEFAULT_TILE_SIZE_MM = 600;
const DEFAULT_IMAGE_WIDTH = 800;
const DEFAULT_IMAGE_HEIGHT = 600;
const DEFAULT_IMAGE_BYTES = 102_400;
const ROOM_TYPE_SORT_ORDERS: Record<RoomTypeCode, number> = {
  [RoomTypeCode.LIVING_ROOM]: 1,
  [RoomTypeCode.BEDROOM]: 2,
  [RoomTypeCode.KITCHEN]: 3,
  [RoomTypeCode.KITCHEN_LIVING]: 4,
  [RoomTypeCode.BATHROOM]: 5,
};

export const MAX_IMAGE_BYTES = 5_242_880;

export interface AdminCatalogRoomTypeIds {
  livingRoom: string;
  bedroom: string;
  kitchen: string;
  kitchenLiving: string;
  bathroom: string;
}

export async function createAdminCatalogRoomTypes(
  prisma: PrismaService,
): Promise<AdminCatalogRoomTypeIds> {
  const names: Record<RoomTypeCode, LocalizedText> = {
    [RoomTypeCode.LIVING_ROOM]: localized('Living Room', 'Вітальня'),
    [RoomTypeCode.BEDROOM]: localized('Bedroom', 'Спальня'),
    [RoomTypeCode.KITCHEN]: localized('Kitchen', 'Кухня'),
    [RoomTypeCode.KITCHEN_LIVING]: localized(
      'Kitchen-Living Room',
      'Кухня-вітальня',
    ),
    [RoomTypeCode.BATHROOM]: localized('Bathroom', 'Санвузол'),
  };

  const [livingRoom, bedroom, kitchen, kitchenLiving, bathroom] =
    await Promise.all(
      Object.values(RoomTypeCode).map((code) =>
        prisma.roomType.create({
          data: {
            code,
            name: names[code],
            sortOrder: ROOM_TYPE_SORT_ORDERS[code],
          },
        }),
      ),
    );

  return {
    livingRoom: livingRoom.id,
    bedroom: bedroom.id,
    kitchen: kitchen.id,
    kitchenLiving: kitchenLiving.id,
    bathroom: bathroom.id,
  };
}

export interface CategoryFixtureOverrides {
  name?: LocalizedText;
  wastePercent?: number;
  surface?: SurfaceKind;
  status?: PublicationStatus;
}

export interface CategoryFixture {
  id: string;
  revision: string;
  name: LocalizedText;
  wastePercent: number;
  surface: SurfaceKind;
  status: PublicationStatus;
}

export async function createCategoryFixture(
  prisma: PrismaService,
  overrides: CategoryFixtureOverrides = {},
): Promise<CategoryFixture> {
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.category.create({
    data: {
      name:
        overrides.name ??
        localized(`Category ${suffix}`, `Категорія ${suffix}`),
      wastePercent: overrides.wastePercent ?? DEFAULT_WASTE_PERCENT,
      surface: overrides.surface ?? SurfaceKind.FLOOR,
      status: overrides.status ?? PublicationStatus.DRAFT,
    },
  });

  return {
    id: category.id,
    revision: category.revision,
    name: category.name as LocalizedText,
    wastePercent: Number(category.wastePercent),
    surface: category.surface,
    status: category.status,
  };
}

export async function assignCategoryToRoomType(
  prisma: PrismaService,
  roomTypeId: string,
  categoryId: string,
  sortOrder: number,
): Promise<void> {
  await prisma.roomTypeCategory.create({
    data: { roomTypeId, categoryId, sortOrder },
  });
}

export interface MaterialTypeFixtureOverrides {
  code?: string;
  name?: LocalizedText;
  status?: PublicationStatus;
}

export interface MaterialTypeFixture {
  id: string;
  code: string;
  revision: string;
  status: PublicationStatus;
}

export async function createMaterialTypeFixture(
  prisma: PrismaService,
  overrides: MaterialTypeFixtureOverrides = {},
): Promise<MaterialTypeFixture> {
  const suffix = randomUUID().slice(0, 8);
  const materialType = await prisma.materialType.create({
    data: {
      code: overrides.code ?? `material_${suffix}`,
      name:
        overrides.name ?? localized(`Material ${suffix}`, `Матеріал ${suffix}`),
      status: overrides.status ?? PublicationStatus.PUBLISHED,
    },
  });

  return {
    id: materialType.id,
    code: materialType.code,
    revision: materialType.revision,
    status: materialType.status,
  };
}

export interface ImageFixtureOverrides {
  publicId?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export interface ImageFixture {
  id: string;
  publicId: string;
}

export async function createImageFixture(
  prisma: PrismaService,
  overrides: ImageFixtureOverrides = {},
): Promise<ImageFixture> {
  const suffix = randomUUID().slice(0, 8);
  const image = await prisma.image.create({
    data: {
      publicId: overrides.publicId ?? `roomwise/uploads/fixture-${suffix}`,
      width: overrides.width ?? DEFAULT_IMAGE_WIDTH,
      height: overrides.height ?? DEFAULT_IMAGE_HEIGHT,
      bytes: overrides.bytes ?? DEFAULT_IMAGE_BYTES,
      format: overrides.format ?? 'png',
    },
  });

  return { id: image.id, publicId: image.publicId };
}

export interface ProductFixtureOverrides {
  categoryId: string;
  materialTypeId: string;
  name?: LocalizedText;
  description?: LocalizedText;
  brand?: string;
  manufacturer?: string;
  color?: LocalizedText;
  size?: LocalizedText;
  priceCents?: number;
  unit?: ProductUnit;
  status?: PublicationStatus;
  textureImageId?: string;
  tileWidthMm?: number;
  tileLengthMm?: number;
  fallbackColor?: string;
}

export interface ProductFixture {
  id: string;
  revision: string;
  status: PublicationStatus;
}

export async function createProductFixture(
  prisma: PrismaService,
  overrides: ProductFixtureOverrides,
): Promise<ProductFixture> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      categoryId: overrides.categoryId,
      materialTypeId: overrides.materialTypeId,
      name: overrides.name ?? localized(`Product ${suffix}`, `Товар ${suffix}`),
      description:
        overrides.description ??
        localized('A test product.', 'Тестовий товар.'),
      brand: overrides.brand ?? 'Roomwise',
      manufacturer: overrides.manufacturer ?? 'Roomwise Manufacturing',
      color: overrides.color ?? localized('White', 'Білий'),
      size: overrides.size ?? localized('600x600 mm', '600x600 мм'),
      priceCents: overrides.priceCents ?? DEFAULT_PRICE_CENTS,
      unit: overrides.unit ?? ProductUnit.SQM,
      textureImageId: overrides.textureImageId,
      tileWidthMm: overrides.tileWidthMm ?? DEFAULT_TILE_SIZE_MM,
      tileLengthMm: overrides.tileLengthMm ?? DEFAULT_TILE_SIZE_MM,
      fallbackColor: overrides.fallbackColor ?? '#F5F5F0',
      status: overrides.status ?? PublicationStatus.DRAFT,
    },
  });

  return { id: product.id, revision: product.revision, status: product.status };
}

export async function addPrimaryProductImage(
  prisma: PrismaService,
  productId: string,
  imageId: string,
): Promise<void> {
  await prisma.productImage.create({
    data: { productId, imageId, sortOrder: 1, isPrimary: true },
  });
}

export interface StyleDefaultMaterialFixtureParams {
  roomTypeId: string;
  categoryId: string;
  productId: string;
  styleName?: LocalizedText;
}

export interface StyleDefaultMaterialFixture {
  styleId: string;
  styleName: LocalizedText;
}

export async function createStyleUsingProductAsDefault(
  prisma: PrismaService,
  params: StyleDefaultMaterialFixtureParams,
): Promise<StyleDefaultMaterialFixture> {
  const suffix = randomUUID().slice(0, 8);
  const styleName =
    params.styleName ?? localized(`Style ${suffix}`, `Стиль ${suffix}`);

  const style = await prisma.style.create({
    data: {
      name: styleName,
      description: localized('A test style.', 'Тестовий стиль.'),
      sortOrder: 1,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const link = await prisma.roomTypeCategory.findUnique({
    where: {
      roomTypeId_categoryId: {
        roomTypeId: params.roomTypeId,
        categoryId: params.categoryId,
      },
    },
  });
  if (!link) {
    const last = await prisma.roomTypeCategory.findFirst({
      where: { roomTypeId: params.roomTypeId },
      orderBy: { sortOrder: 'desc' },
    });
    await assignCategoryToRoomType(
      prisma,
      params.roomTypeId,
      params.categoryId,
      (last?.sortOrder ?? -1) + 1,
    );
  }

  await prisma.styleDefaultMaterial.create({
    data: {
      styleId: style.id,
      roomTypeId: params.roomTypeId,
      categoryId: params.categoryId,
      productId: params.productId,
    },
  });

  return { styleId: style.id, styleName };
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export function validPngBuffer(): Buffer {
  return Buffer.from(VALID_PNG_BASE64, 'base64');
}

export function textDisguisedAsPngBuffer(): Buffer {
  return Buffer.from('this is not an image, just plain text bytes');
}

export function oversizedPngBuffer(): Buffer {
  const padding = Buffer.alloc(MAX_IMAGE_BYTES + 1024, 0);
  return Buffer.concat([PNG_SIGNATURE, padding]);
}

export function localizedText(en: string, uk: string): LocalizedText {
  return localized(en, uk);
}

export type { LocalizedText };
