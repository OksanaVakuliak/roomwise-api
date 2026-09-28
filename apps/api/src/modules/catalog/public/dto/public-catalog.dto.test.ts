import { describe, expect, it } from 'vitest';
import { publicDefaultMaterialsResponseSchema } from './default-materials.schema';
import { publicEngineeringResponseSchema } from './engineering.schema';
import { imageRefSchema, textureRefSchema } from './image-ref.schema';
import { langQuerySchema } from './lang-query.schema';
import { publicProductCardsResponseSchema } from './product-card.schema';
import { publicProductDetailsSchema } from './product-details.schema';
import { publicRoomTypesResponseSchema } from './room-type.schema';
import { publicStylesResponseSchema } from './style.schema';

const IMAGE_REF = {
  id: 'a2f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
  thumb: 'https://res.cloudinary.com/roomwise/image/upload/w_320/oak',
  card: 'https://res.cloudinary.com/roomwise/image/upload/w_640/oak',
  zoom: 'https://res.cloudinary.com/roomwise/image/upload/w_1600/oak',
};

const TEXTURE_REF = {
  id: 'b3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5b',
  url: 'https://res.cloudinary.com/roomwise/image/upload/w_1024/oak-bark',
};

describe('imageRefSchema', () => {
  it('parses a valid image reference', () => {
    expect(imageRefSchema.parse(IMAGE_REF)).toEqual(IMAGE_REF);
  });

  it('rejects a reference missing the zoom variant', () => {
    const { zoom: _zoom, ...rest } = IMAGE_REF;

    expect(imageRefSchema.safeParse(rest).success).toBe(false);
  });
});

describe('textureRefSchema', () => {
  it('parses a valid texture reference', () => {
    expect(textureRefSchema.parse(TEXTURE_REF)).toEqual(TEXTURE_REF);
  });

  it('rejects a non-url texture url', () => {
    expect(
      textureRefSchema.safeParse({ ...TEXTURE_REF, url: 'not-a-url' }).success,
    ).toBe(false);
  });
});

describe('langQuerySchema', () => {
  it('resolves a supported language', () => {
    expect(langQuerySchema.parse({ lang: 'uk' })).toEqual({ lang: 'uk' });
  });

  it('resolves an unsupported language to en', () => {
    expect(langQuerySchema.parse({ lang: 'fr' })).toEqual({ lang: 'en' });
  });

  it('resolves a missing lang to en', () => {
    expect(langQuerySchema.parse({})).toEqual({ lang: 'en' });
  });

  it('resolves a differently-cased language case-insensitively', () => {
    expect(langQuerySchema.parse({ lang: 'UK' })).toEqual({ lang: 'uk' });
  });
});

describe('publicStylesResponseSchema', () => {
  it('parses a valid styles response', () => {
    const response = {
      items: [
        {
          id: 'c3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5c',
          name: 'Скандинавський',
          description: 'Світлі кольори та натуральні матеріали',
          image: IMAGE_REF,
        },
      ],
    };

    expect(publicStylesResponseSchema.parse(response)).toEqual(response);
  });

  it('allows a null image', () => {
    const response = {
      items: [
        {
          id: 'c3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5c',
          name: 'Скандинавський',
          description: 'Світлі кольори та натуральні матеріали',
          image: null,
        },
      ],
    };

    expect(publicStylesResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejects an item missing a name', () => {
    const response = {
      items: [
        {
          id: 'c3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5c',
          description: 'Опис',
          image: null,
        },
      ],
    };

    expect(publicStylesResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('publicRoomTypesResponseSchema', () => {
  it('parses a valid room types response', () => {
    const response = {
      items: [
        {
          id: 'd3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5d',
          code: 'BATHROOM',
          name: 'Санвузол',
          categories: [
            {
              id: 'e3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5e',
              name: 'Підлога',
              surface: 'FLOOR',
              wastePercent: 10,
              productCount: 7,
            },
          ],
        },
      ],
    };

    expect(publicRoomTypesResponseSchema.parse(response)).toEqual(response);
  });

  it('allows productCount of zero for an empty category', () => {
    const response = {
      items: [
        {
          id: 'd3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5d',
          code: 'BATHROOM',
          name: 'Санвузол',
          categories: [
            {
              id: 'e3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5e',
              name: 'Підлога',
              surface: 'FLOOR',
              wastePercent: 10,
              productCount: 0,
            },
          ],
        },
      ],
    };

    expect(publicRoomTypesResponseSchema.safeParse(response).success).toBe(
      true,
    );
  });

  it('rejects an unknown room type code', () => {
    const response = {
      items: [
        {
          id: 'd3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5d',
          code: 'GARAGE',
          name: 'Гараж',
          categories: [],
        },
      ],
    };

    expect(publicRoomTypesResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});

describe('publicProductCardsResponseSchema', () => {
  it('parses a valid product cards response', () => {
    const response = {
      items: [
        {
          id: 'f3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5f',
          name: 'Ламінат «Дуб натуральний»',
          brand: 'Floorwise',
          manufacturer: 'Floorwise Manufacturing',
          size: '1380 × 193 мм',
          color: 'Натуральний дуб',
          priceCents: 1800,
          unit: 'SQM',
          materialTypeCode: 'laminate',
          heatedFloorCompatible: true,
          image: IMAGE_REF,
        },
      ],
    };

    expect(publicProductCardsResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an unknown unit', () => {
    const response = {
      items: [
        {
          id: 'f3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f5f',
          name: 'Ламінат',
          brand: 'Floorwise',
          manufacturer: 'Floorwise Manufacturing',
          size: '1380 × 193 мм',
          color: 'Натуральний дуб',
          priceCents: 1800,
          unit: 'KG',
          materialTypeCode: 'laminate',
          heatedFloorCompatible: true,
          image: null,
        },
      ],
    };

    expect(publicProductCardsResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});

describe('publicProductDetailsSchema', () => {
  const base = {
    id: 'a1f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f11',
    categoryId: 'a2f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f12',
    name: 'Ламінат «Дуб натуральний»',
    description: 'Вологостійкий ламінат для житлових приміщень',
    brand: 'Floorwise',
    manufacturer: 'Floorwise Manufacturing',
    size: '1380 × 193 мм',
    color: 'Натуральний дуб',
    priceCents: 1800,
    unit: 'SQM',
    materialTypeCode: 'laminate',
    heatedFloorCompatible: true,
    wastePercent: 5,
    images: [IMAGE_REF],
    attributes: [{ name: 'Товщина', value: '8 мм' }],
  };

  it('parses a surface product with surface data', () => {
    const response = {
      ...base,
      surface: {
        kind: 'FLOOR',
        texture: TEXTURE_REF,
        tileWidthMm: 193,
        tileLengthMm: 1380,
        fallbackColor: '#B08D62',
      },
    };

    expect(publicProductDetailsSchema.parse(response)).toEqual(response);
  });

  it('parses a non-surface product with a null surface', () => {
    const response = { ...base, surface: null };

    expect(publicProductDetailsSchema.safeParse(response).success).toBe(true);
  });

  it('rejects a fallbackColor that is not a hex triplet', () => {
    const response = {
      ...base,
      surface: {
        kind: 'FLOOR',
        texture: TEXTURE_REF,
        tileWidthMm: 193,
        tileLengthMm: 1380,
        fallbackColor: 'brown',
      },
    };

    expect(publicProductDetailsSchema.safeParse(response).success).toBe(false);
  });
});

describe('publicDefaultMaterialsResponseSchema', () => {
  it('parses a valid default materials response', () => {
    const response = {
      styleId: 'b1f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f21',
      items: [
        {
          roomTypeCode: 'BEDROOM',
          categoryId: 'b2f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f22',
          productId: 'b3f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f23',
        },
      ],
    };

    expect(publicDefaultMaterialsResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it('allows a null productId for an unfilled or unavailable pair', () => {
    const response = {
      styleId: 'b1f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f21',
      items: [
        {
          roomTypeCode: 'BEDROOM',
          categoryId: 'b2f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f22',
          productId: null,
        },
      ],
    };

    expect(
      publicDefaultMaterialsResponseSchema.safeParse(response).success,
    ).toBe(true);
  });
});

describe('publicEngineeringResponseSchema', () => {
  it('parses a valid engineering response', () => {
    const response = {
      packageItems: [
        {
          id: 'c1f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f31',
          name: 'Демонтаж старого покриття',
          description: 'Виконується перед укладанням нового покриття',
          includedInBase: true,
          priceCents: null,
          unit: null,
        },
      ],
      options: [
        {
          id: 'c2f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f32',
          kind: 'ENGINEERING',
          name: 'Тепла підлога',
          description: 'Електрична тепла підлога під фінішне покриття',
          image: IMAGE_REF,
          priceCents: 3500,
          unit: 'ROOM_SQM',
          perRoom: true,
          roomTypeCodes: ['BATHROOM', 'KITCHEN'],
          minQuantity: null,
          maxQuantity: null,
        },
      ],
    };

    expect(publicEngineeringResponseSchema.parse(response)).toEqual(response);
  });

  it('allows an empty roomTypeCodes array to mean all room types', () => {
    const response = {
      packageItems: [],
      options: [
        {
          id: 'c2f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f32',
          kind: 'ADDITIONAL',
          name: 'Прибирання після ремонту',
          description: 'Клінінг усієї квартири',
          image: null,
          priceCents: 2000,
          unit: 'PIECE',
          perRoom: false,
          roomTypeCodes: [],
          minQuantity: 1,
          maxQuantity: 3,
        },
      ],
    };

    expect(publicEngineeringResponseSchema.safeParse(response).success).toBe(
      true,
    );
  });

  it('rejects a package item with an unknown unit', () => {
    const response = {
      packageItems: [
        {
          id: 'c1f5c3a0-1b2c-4d3e-8f9a-0b1c2d3e4f31',
          name: 'Демонтаж старого покриття',
          description: 'Опис',
          includedInBase: false,
          priceCents: 1000,
          unit: 'KG',
        },
      ],
      options: [],
    };

    expect(publicEngineeringResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});
