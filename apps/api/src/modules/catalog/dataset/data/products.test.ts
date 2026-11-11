import { describe, expect, it } from 'vitest';
import { SurfaceKind } from '../../../../generated/prisma/enums';
import { categories } from './categories';
import { seedImages } from './images';
import { products } from './products';

const surfaceByCategoryId = new Map(
  categories.map((category) => [category.id, category.surface]),
);
const imageById = new Map(
  Object.values(seedImages).map((image) => [image.id, image]),
);
const surfaceKinds: SurfaceKind[] = [
  SurfaceKind.FLOOR,
  SurfaceKind.WALLS,
  SurfaceKind.CEILING,
];

const texturedSurfaceProducts = products.filter((product) => {
  const surface = surfaceByCategoryId.get(product.categoryId);
  return (
    surface !== undefined &&
    surfaceKinds.includes(surface) &&
    product.textureImageId !== null
  );
});

describe('textured surface products', () => {
  it('have positive tile width and length', () => {
    const offenders = texturedSurfaceProducts
      .filter(
        (product) =>
          !product.tileWidthMm ||
          product.tileWidthMm <= 0 ||
          !product.tileLengthMm ||
          product.tileLengthMm <= 0,
      )
      .map((product) => product.name.en);

    expect(offenders, `Missing tile size: ${offenders.join(', ')}`).toEqual([]);
  });

  it('have a fallback color and a known texture image', () => {
    const offenders = texturedSurfaceProducts
      .filter(
        (product) =>
          !product.fallbackColor ||
          !imageById.has(product.textureImageId ?? ''),
      )
      .map((product) => product.name.en);

    expect(
      offenders,
      `Missing fallback color or texture image: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('warn when the tile aspect ratio differs from the texture by more than 2x', () => {
    const mismatched = texturedSurfaceProducts.flatMap((product) => {
      const image = imageById.get(product.textureImageId ?? '');
      if (!image || !product.tileWidthMm || !product.tileLengthMm) {
        return [];
      }
      const tileRatio = product.tileWidthMm / product.tileLengthMm;
      const imageRatio = image.width / image.height;
      const factor =
        Math.max(tileRatio, imageRatio) / Math.min(tileRatio, imageRatio);
      return factor > 2 ? [`${product.name.en} (${factor.toFixed(1)}x)`] : [];
    });

    if (mismatched.length > 0) {
      console.warn(
        `Tile aspect ratio differs from texture by more than 2x: ${mismatched.join(', ')}`,
      );
    }
  });
});
