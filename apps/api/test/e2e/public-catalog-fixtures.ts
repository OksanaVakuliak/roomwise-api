import type { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  OptionKind,
  OptionUnit,
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

const FLOORING_WASTE_PERCENT = 10;
const LIGHTING_WASTE_PERCENT = 5;
const WALLS_WASTE_PERCENT = 7;
const EMPTY_CATEGORY_WASTE_PERCENT = 8;
const ARCHIVED_CATEGORY_WASTE_PERCENT = 5;
const DRAFT_CATEGORY_WASTE_PERCENT = 5;
const PRODUCT_B_WASTE_PERCENT_OVERRIDE = 15;

const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 600;
const IMAGE_BYTES = 102_400;

const PRODUCT_A_PRICE_CENTS = 180_000;
const PRODUCT_B_PRICE_CENTS = 220_000;
const PRODUCT_LIGHTING_PRICE_CENTS = 45_000;
const PRODUCT_DRAFT_PRICE_CENTS = 90_000;
const PRODUCT_ARCHIVED_PRICE_CENTS = 150_000;

const TILE_WIDTH_MM = 193;
const TILE_LENGTH_MM = 1380;
const PRODUCT_A_FALLBACK_COLOR = '#B08D62';
const PRODUCT_B_FALLBACK_COLOR = '#8A6D4E';

const PACKAGE_ITEM_PRICED_CENTS = 5000;
const OPTION_ROOM_SQM_PRICE_CENTS = 3500;
const OPTION_ROOM_PRICE_CENTS = 2000;
const OPTION_PIECE_PRICE_CENTS = 1500;
const OPTION_ADDITIONAL_PRICE_CENTS = 4000;
const OPTION_PIECE_MIN_QUANTITY = 1;
const OPTION_PIECE_MAX_QUANTITY = 3;

export interface PublicCatalogRoomTypeIds {
  livingRoom: string;
  bedroom: string;
  kitchen: string;
  kitchenLiving: string;
  bathroom: string;
}

export interface PublicCatalogCategoryIds {
  flooring: string;
  lighting: string;
  walls: string;
  empty: string;
  archived: string;
  draft: string;
}

export interface PublicCatalogProductIds {
  a: string;
  b: string;
  lighting: string;
  draft: string;
  archived: string;
}

export interface PublicCatalogStyleIds {
  scandinavian: string;
  modern: string;
  hidden: string;
}

export interface PublicCatalogEngineeringIds {
  packageItemIncluded: string;
  packageItemPriced: string;
  packageItemDraft: string;
  optionRoomSqmRestricted: string;
  optionRoomAll: string;
  optionPiece: string;
  optionAdditionalProject: string;
  optionDraft: string;
}

export interface PublicCatalogImageRef {
  id: string;
  publicId: string;
}

export interface PublicCatalogFixtures {
  roomTypes: PublicCatalogRoomTypeIds;
  categories: PublicCatalogCategoryIds;
  materialTypeId: string;
  materialTypeCode: string;
  images: {
    productAPrimary: PublicCatalogImageRef;
    productASecondary: PublicCatalogImageRef;
    productATexture: PublicCatalogImageRef;
    productB: PublicCatalogImageRef;
    productLighting: PublicCatalogImageRef;
    styleScandinavian: PublicCatalogImageRef;
    styleModern: PublicCatalogImageRef;
  };
  products: PublicCatalogProductIds;
  styles: PublicCatalogStyleIds;
  engineering: PublicCatalogEngineeringIds;
}

export const PUBLIC_CATALOG_FIXTURE_DATA = {
  roomTypes: {
    livingRoom: localized('Living Room', 'Вітальня'),
    bedroom: localized('Bedroom', 'Спальня'),
    kitchen: localized('Kitchen', 'Кухня'),
    kitchenLiving: localized('Kitchen-Living Room', 'Кухня-вітальня'),
    bathroom: localized('Bathroom', 'Санвузол'),
  },
  categories: {
    flooring: {
      name: localized('Flooring', 'Підлога'),
      wastePercent: FLOORING_WASTE_PERCENT,
    },
    lighting: {
      name: localized('Lighting', 'Освітлення'),
      wastePercent: LIGHTING_WASTE_PERCENT,
    },
    walls: {
      name: localized('Walls', 'Стіни'),
      wastePercent: WALLS_WASTE_PERCENT,
    },
    empty: {
      name: localized('Skirting', 'Плінтус'),
      wastePercent: EMPTY_CATEGORY_WASTE_PERCENT,
    },
    archived: {
      name: localized('Retired Category', 'Знята категорія'),
      wastePercent: ARCHIVED_CATEGORY_WASTE_PERCENT,
    },
    draft: {
      name: localized('Draft Category', 'Чернеткова категорія'),
      wastePercent: DRAFT_CATEGORY_WASTE_PERCENT,
    },
  },
  products: {
    a: {
      name: localized('Classic Oak Laminate', 'Класичний дубовий ламінат'),
      description: localized(
        'A durable laminate floor board.',
        'Міцна ламінатна дошка для підлоги.',
      ),
      brand: 'Floorwise',
      manufacturer: 'Floorwise Manufacturing',
      color: localized('Natural Oak', 'Натуральний дуб'),
      size: localized('1380 x 193 mm', '1380 x 193 мм'),
      priceCents: PRODUCT_A_PRICE_CENTS,
      attributes: [
        {
          name: localized('Thickness', 'Товщина'),
          value: localized('8 mm', '8 мм'),
        },
        {
          name: localized('Wear class', 'Клас зносостійкості'),
          value: localized('AC4', 'AC4'),
        },
      ],
    },
    b: {
      name: localized(
        'Premium Walnut Laminate',
        'Преміум ламінат волоський горіх',
      ),
      description: localized(
        'A premium laminate floor board with a deeper waste allowance.',
        'Преміальна ламінатна дошка з більшим запасом на підрізку.',
      ),
      brand: 'Floorwise',
      manufacturer: 'Floorwise Manufacturing',
      color: localized('Walnut', 'Волоський горіх'),
      size: localized('1380 x 193 mm', '1380 x 193 мм'),
      priceCents: PRODUCT_B_PRICE_CENTS,
    },
    lighting: {
      name: localized('Pendant Lamp', 'Підвісний світильник'),
      description: localized(
        'A ceiling pendant lamp.',
        'Стельовий підвісний світильник.',
      ),
      brand: 'Lumina',
      manufacturer: 'Lumina Lighting',
      color: localized('Black', 'Чорний'),
      size: localized('30 cm', '30 см'),
      priceCents: PRODUCT_LIGHTING_PRICE_CENTS,
    },
  },
  styles: {
    scandinavian: localized('Scandinavian', 'Скандинавський'),
    modern: localized('Modern', 'Сучасний'),
    hidden: localized('Hidden', 'Прихований'),
  },
  engineering: {
    packageItemIncluded: localized(
      'Demolition and disposal',
      'Демонтаж і вивезення сміття',
    ),
    packageItemPriced: localized('Electrical wiring', 'Електромонтаж'),
    optionRoomSqmRestricted: localized('Heated Floor', 'Тепла підлога'),
    optionRoomAll: localized('Smart Home', 'Розумний дім'),
    optionPiece: localized('Extra Socket', 'Додаткова розетка'),
    optionAdditionalProject: localized(
      'Post-renovation Cleaning',
      'Прибирання після ремонту',
    ),
  },
} as const;

export async function createPublicCatalogFixtures(
  prisma: PrismaService,
): Promise<PublicCatalogFixtures> {
  const uniqueSuffix = Date.now().toString(36);
  const data = PUBLIC_CATALOG_FIXTURE_DATA;

  const materialType = await prisma.materialType.create({
    data: {
      code: `laminate-${uniqueSuffix}`,
      name: localized('Laminate', 'Ламінат'),
      status: PublicationStatus.PUBLISHED,
    },
  });

  const [livingRoom, bedroom, kitchen, kitchenLiving, bathroom] =
    await Promise.all([
      prisma.roomType.create({
        data: {
          code: RoomTypeCode.LIVING_ROOM,
          name: data.roomTypes.livingRoom,
          sortOrder: 1,
        },
      }),
      prisma.roomType.create({
        data: {
          code: RoomTypeCode.BEDROOM,
          name: data.roomTypes.bedroom,
          sortOrder: 2,
        },
      }),
      prisma.roomType.create({
        data: {
          code: RoomTypeCode.KITCHEN,
          name: data.roomTypes.kitchen,
          sortOrder: 3,
        },
      }),
      prisma.roomType.create({
        data: {
          code: RoomTypeCode.KITCHEN_LIVING,
          name: data.roomTypes.kitchenLiving,
          sortOrder: 4,
        },
      }),
      prisma.roomType.create({
        data: {
          code: RoomTypeCode.BATHROOM,
          name: data.roomTypes.bathroom,
          sortOrder: 5,
        },
      }),
    ]);

  const [flooring, lighting, walls, empty, archived, draft] = await Promise.all(
    [
      prisma.category.create({
        data: {
          name: data.categories.flooring.name,
          wastePercent: data.categories.flooring.wastePercent,
          surface: SurfaceKind.FLOOR,
          status: PublicationStatus.PUBLISHED,
        },
      }),
      prisma.category.create({
        data: {
          name: data.categories.lighting.name,
          wastePercent: data.categories.lighting.wastePercent,
          surface: SurfaceKind.NONE,
          status: PublicationStatus.PUBLISHED,
        },
      }),
      prisma.category.create({
        data: {
          name: data.categories.walls.name,
          wastePercent: data.categories.walls.wastePercent,
          surface: SurfaceKind.WALLS,
          status: PublicationStatus.PUBLISHED,
        },
      }),
      prisma.category.create({
        data: {
          name: data.categories.empty.name,
          wastePercent: data.categories.empty.wastePercent,
          surface: SurfaceKind.NONE,
          status: PublicationStatus.PUBLISHED,
        },
      }),
      prisma.category.create({
        data: {
          name: data.categories.archived.name,
          wastePercent: data.categories.archived.wastePercent,
          surface: SurfaceKind.NONE,
          status: PublicationStatus.ARCHIVED,
        },
      }),
      prisma.category.create({
        data: {
          name: data.categories.draft.name,
          wastePercent: data.categories.draft.wastePercent,
          surface: SurfaceKind.NONE,
          status: PublicationStatus.DRAFT,
        },
      }),
    ],
  );

  await Promise.all([
    prisma.roomTypeCategory.create({
      data: {
        roomTypeId: livingRoom.id,
        categoryId: flooring.id,
        sortOrder: 1,
      },
    }),
    prisma.roomTypeCategory.create({
      data: {
        roomTypeId: livingRoom.id,
        categoryId: lighting.id,
        sortOrder: 2,
      },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: livingRoom.id, categoryId: draft.id, sortOrder: 3 },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: bedroom.id, categoryId: flooring.id, sortOrder: 1 },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: kitchen.id, categoryId: archived.id, sortOrder: 1 },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: kitchen.id, categoryId: flooring.id, sortOrder: 2 },
    }),
    prisma.roomTypeCategory.create({
      data: {
        roomTypeId: kitchenLiving.id,
        categoryId: flooring.id,
        sortOrder: 1,
      },
    }),
    prisma.roomTypeCategory.create({
      data: {
        roomTypeId: kitchenLiving.id,
        categoryId: walls.id,
        sortOrder: 2,
      },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: bathroom.id, categoryId: flooring.id, sortOrder: 1 },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: bathroom.id, categoryId: lighting.id, sortOrder: 2 },
    }),
    prisma.roomTypeCategory.create({
      data: { roomTypeId: bathroom.id, categoryId: empty.id, sortOrder: 3 },
    }),
  ]);

  const [
    productAPrimaryImage,
    productASecondaryImage,
    productATextureImage,
    productBImage,
    productLightingImage,
    styleScandinavianImage,
    styleModernImage,
  ] = await Promise.all([
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/product-a-primary-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/product-a-secondary-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/product-a-texture-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/product-b-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/product-lighting-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/style-scandinavian-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
    prisma.image.create({
      data: {
        publicId: `roomwise/seed/style-modern-${uniqueSuffix}`,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        bytes: IMAGE_BYTES,
        format: 'jpg',
      },
    }),
  ]);

  const productA = await prisma.product.create({
    data: {
      categoryId: flooring.id,
      materialTypeId: materialType.id,
      name: data.products.a.name,
      description: data.products.a.description,
      brand: data.products.a.brand,
      manufacturer: data.products.a.manufacturer,
      color: data.products.a.color,
      size: data.products.a.size,
      priceCents: data.products.a.priceCents,
      unit: ProductUnit.SQM,
      heatedFloorCompatible: true,
      textureImageId: productATextureImage.id,
      tileWidthMm: TILE_WIDTH_MM,
      tileLengthMm: TILE_LENGTH_MM,
      fallbackColor: PRODUCT_A_FALLBACK_COLOR,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const productB = await prisma.product.create({
    data: {
      categoryId: flooring.id,
      materialTypeId: materialType.id,
      name: data.products.b.name,
      description: data.products.b.description,
      brand: data.products.b.brand,
      manufacturer: data.products.b.manufacturer,
      color: data.products.b.color,
      size: data.products.b.size,
      priceCents: data.products.b.priceCents,
      unit: ProductUnit.SQM,
      heatedFloorCompatible: false,
      wastePercentOverride: PRODUCT_B_WASTE_PERCENT_OVERRIDE,
      textureImageId: productBImage.id,
      tileWidthMm: TILE_WIDTH_MM,
      tileLengthMm: TILE_LENGTH_MM,
      fallbackColor: PRODUCT_B_FALLBACK_COLOR,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const productLighting = await prisma.product.create({
    data: {
      categoryId: lighting.id,
      materialTypeId: materialType.id,
      name: data.products.lighting.name,
      description: data.products.lighting.description,
      brand: data.products.lighting.brand,
      manufacturer: data.products.lighting.manufacturer,
      color: data.products.lighting.color,
      size: data.products.lighting.size,
      priceCents: data.products.lighting.priceCents,
      unit: ProductUnit.PIECE,
      heatedFloorCompatible: false,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const productDraft = await prisma.product.create({
    data: {
      categoryId: flooring.id,
      materialTypeId: materialType.id,
      name: localized('Draft Product', 'Чернетковий товар'),
      description: localized('Not ready yet.', 'Ще не готовий.'),
      brand: 'Floorwise',
      manufacturer: 'Floorwise Manufacturing',
      color: localized('Grey', 'Сірий'),
      size: localized('600 x 600 mm', '600 x 600 мм'),
      priceCents: PRODUCT_DRAFT_PRICE_CENTS,
      unit: ProductUnit.SQM,
      status: PublicationStatus.DRAFT,
    },
  });

  const productArchived = await prisma.product.create({
    data: {
      categoryId: flooring.id,
      materialTypeId: materialType.id,
      name: localized('Discontinued Tile', 'Знятий з виробництва товар'),
      description: localized('No longer sold.', 'Більше не продається.'),
      brand: 'Floorwise',
      manufacturer: 'Floorwise Manufacturing',
      color: localized('Beige', 'Бежевий'),
      size: localized('600 x 600 mm', '600 x 600 мм'),
      priceCents: PRODUCT_ARCHIVED_PRICE_CENTS,
      unit: ProductUnit.SQM,
      status: PublicationStatus.ARCHIVED,
    },
  });

  await Promise.all([
    prisma.productImage.create({
      data: {
        productId: productA.id,
        imageId: productAPrimaryImage.id,
        sortOrder: 1,
        isPrimary: true,
      },
    }),
    prisma.productImage.create({
      data: {
        productId: productA.id,
        imageId: productASecondaryImage.id,
        sortOrder: 2,
        isPrimary: false,
      },
    }),
    prisma.productImage.create({
      data: {
        productId: productB.id,
        imageId: productBImage.id,
        sortOrder: 1,
        isPrimary: true,
      },
    }),
    prisma.productImage.create({
      data: {
        productId: productLighting.id,
        imageId: productLightingImage.id,
        sortOrder: 1,
        isPrimary: true,
      },
    }),
  ]);

  await Promise.all(
    data.products.a.attributes.map((attribute, index) =>
      prisma.productAttribute.create({
        data: {
          productId: productA.id,
          name: attribute.name,
          value: attribute.value,
          sortOrder: index + 1,
        },
      }),
    ),
  );

  const scandinavianStyle = await prisma.style.create({
    data: {
      name: data.styles.scandinavian,
      description: localized(
        'Light and minimal.',
        'Світлий і мінімалістичний.',
      ),
      imageId: styleScandinavianImage.id,
      sortOrder: 1,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const modernStyle = await prisma.style.create({
    data: {
      name: data.styles.modern,
      description: localized(
        'Clean lines and bold shapes.',
        'Чіткі лінії й сміливі форми.',
      ),
      imageId: styleModernImage.id,
      sortOrder: 2,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const hiddenStyle = await prisma.style.create({
    data: {
      name: data.styles.hidden,
      description: localized('Not published yet.', 'Ще не опубліковано.'),
      sortOrder: 3,
      status: PublicationStatus.DRAFT,
    },
  });

  await Promise.all([
    prisma.styleDefaultMaterial.create({
      data: {
        styleId: scandinavianStyle.id,
        roomTypeId: livingRoom.id,
        categoryId: flooring.id,
        productId: productA.id,
      },
    }),
    prisma.styleDefaultMaterial.create({
      data: {
        styleId: scandinavianStyle.id,
        roomTypeId: livingRoom.id,
        categoryId: lighting.id,
        productId: productLighting.id,
      },
    }),
    prisma.styleDefaultMaterial.create({
      data: {
        styleId: scandinavianStyle.id,
        roomTypeId: bedroom.id,
        categoryId: flooring.id,
        productId: productB.id,
      },
    }),
    prisma.styleDefaultMaterial.create({
      data: {
        styleId: scandinavianStyle.id,
        roomTypeId: bathroom.id,
        categoryId: flooring.id,
        productId: productArchived.id,
      },
    }),
  ]);

  const packageItemIncluded = await prisma.engineeringPackageItem.create({
    data: {
      name: data.engineering.packageItemIncluded,
      description: localized(
        'Removing old finishes and hauling away debris.',
        'Демонтаж старого покриття й вивезення сміття.',
      ),
      includedInBase: true,
      sortOrder: 1,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const packageItemPriced = await prisma.engineeringPackageItem.create({
    data: {
      name: data.engineering.packageItemPriced,
      description: localized(
        'Rewiring outlets and switches.',
        'Заміна проводки розеток і вимикачів.',
      ),
      includedInBase: false,
      priceCents: PACKAGE_ITEM_PRICED_CENTS,
      unit: OptionUnit.PROJECT,
      sortOrder: 2,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const packageItemDraft = await prisma.engineeringPackageItem.create({
    data: {
      name: localized('Draft package item', 'Чернетковий пункт пакета'),
      description: localized('Not ready.', 'Не готово.'),
      includedInBase: true,
      sortOrder: 3,
      status: PublicationStatus.DRAFT,
    },
  });

  const optionRoomSqmRestricted = await prisma.option.create({
    data: {
      kind: OptionKind.ENGINEERING,
      name: data.engineering.optionRoomSqmRestricted,
      description: localized(
        'Underfloor heating for wet rooms and kitchens.',
        'Тепла підлога для вологих приміщень і кухонь.',
      ),
      priceCents: OPTION_ROOM_SQM_PRICE_CENTS,
      unit: OptionUnit.ROOM_SQM,
      sortOrder: 1,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const optionRoomAll = await prisma.option.create({
    data: {
      kind: OptionKind.ENGINEERING,
      name: data.engineering.optionRoomAll,
      description: localized(
        'Smart home wiring for any room.',
        'Проводка розумного дому для будь-якого приміщення.',
      ),
      priceCents: OPTION_ROOM_PRICE_CENTS,
      unit: OptionUnit.ROOM,
      sortOrder: 2,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const optionPiece = await prisma.option.create({
    data: {
      kind: OptionKind.ENGINEERING,
      name: data.engineering.optionPiece,
      description: localized(
        'An additional electrical socket.',
        'Додаткова електрична розетка.',
      ),
      priceCents: OPTION_PIECE_PRICE_CENTS,
      unit: OptionUnit.PIECE,
      minQuantity: OPTION_PIECE_MIN_QUANTITY,
      maxQuantity: OPTION_PIECE_MAX_QUANTITY,
      sortOrder: 3,
      status: PublicationStatus.PUBLISHED,
    },
  });

  const optionDraft = await prisma.option.create({
    data: {
      kind: OptionKind.ENGINEERING,
      name: localized('Draft option', 'Чернеткова опція'),
      description: localized('Not ready.', 'Не готово.'),
      priceCents: OPTION_PIECE_PRICE_CENTS,
      unit: OptionUnit.PIECE,
      minQuantity: OPTION_PIECE_MIN_QUANTITY,
      maxQuantity: OPTION_PIECE_MAX_QUANTITY,
      sortOrder: 4,
      status: PublicationStatus.DRAFT,
    },
  });

  const optionAdditionalProject = await prisma.option.create({
    data: {
      kind: OptionKind.ADDITIONAL,
      name: data.engineering.optionAdditionalProject,
      description: localized(
        'General cleaning after the renovation is done.',
        'Загальне прибирання після завершення ремонту.',
      ),
      priceCents: OPTION_ADDITIONAL_PRICE_CENTS,
      unit: OptionUnit.PROJECT,
      sortOrder: 1,
      status: PublicationStatus.PUBLISHED,
    },
  });

  await Promise.all([
    prisma.optionRoomType.create({
      data: { optionId: optionRoomSqmRestricted.id, roomTypeId: bathroom.id },
    }),
    prisma.optionRoomType.create({
      data: { optionId: optionRoomSqmRestricted.id, roomTypeId: kitchen.id },
    }),
  ]);

  return {
    roomTypes: {
      livingRoom: livingRoom.id,
      bedroom: bedroom.id,
      kitchen: kitchen.id,
      kitchenLiving: kitchenLiving.id,
      bathroom: bathroom.id,
    },
    categories: {
      flooring: flooring.id,
      lighting: lighting.id,
      walls: walls.id,
      empty: empty.id,
      archived: archived.id,
      draft: draft.id,
    },
    materialTypeId: materialType.id,
    materialTypeCode: materialType.code,
    images: {
      productAPrimary: {
        id: productAPrimaryImage.id,
        publicId: productAPrimaryImage.publicId,
      },
      productASecondary: {
        id: productASecondaryImage.id,
        publicId: productASecondaryImage.publicId,
      },
      productATexture: {
        id: productATextureImage.id,
        publicId: productATextureImage.publicId,
      },
      productB: { id: productBImage.id, publicId: productBImage.publicId },
      productLighting: {
        id: productLightingImage.id,
        publicId: productLightingImage.publicId,
      },
      styleScandinavian: {
        id: styleScandinavianImage.id,
        publicId: styleScandinavianImage.publicId,
      },
      styleModern: {
        id: styleModernImage.id,
        publicId: styleModernImage.publicId,
      },
    },
    products: {
      a: productA.id,
      b: productB.id,
      lighting: productLighting.id,
      draft: productDraft.id,
      archived: productArchived.id,
    },
    styles: {
      scandinavian: scandinavianStyle.id,
      modern: modernStyle.id,
      hidden: hiddenStyle.id,
    },
    engineering: {
      packageItemIncluded: packageItemIncluded.id,
      packageItemPriced: packageItemPriced.id,
      packageItemDraft: packageItemDraft.id,
      optionRoomSqmRestricted: optionRoomSqmRestricted.id,
      optionRoomAll: optionRoomAll.id,
      optionPiece: optionPiece.id,
      optionAdditionalProject: optionAdditionalProject.id,
      optionDraft: optionDraft.id,
    },
  };
}
