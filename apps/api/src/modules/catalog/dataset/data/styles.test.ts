import { describe, expect, it } from 'vitest';
import { SurfaceKind } from '../../../../generated/prisma/enums';
import { categories } from './categories';
import { products } from './products';
import { roomTypes } from './room-types';
import { styles } from './styles';

const categoryById = new Map(
  categories.map((category) => [category.id, category]),
);
const productById = new Map(products.map((product) => [product.id, product]));

function categoryLabel(categoryId: string): string {
  return categoryById.get(categoryId)?.name.en ?? categoryId;
}

describe('style default materials', () => {
  it('cover every room type', () => {
    const gaps: string[] = [];

    for (const style of styles) {
      for (const roomType of roomTypes) {
        const defaultCategoryIds = new Set(
          style.defaultMaterials
            .filter((material) => material.roomTypeId === roomType.id)
            .map((material) => material.categoryId),
        );
        const roomCategories = roomType.categoryIds.flatMap((categoryId) => {
          const category = categoryById.get(categoryId);
          return category ? [category] : [];
        });

        for (const category of roomCategories) {
          if (
            category.surface === SurfaceKind.NONE &&
            !defaultCategoryIds.has(category.id)
          ) {
            gaps.push(
              `${style.name.en} / ${roomType.name.en}: no default for category ${category.name.en}`,
            );
          }
        }

        const surfaces = new Set(
          roomCategories
            .map((category) => category.surface)
            .filter((surface) => surface !== SurfaceKind.NONE),
        );
        for (const surface of surfaces) {
          const covered = roomCategories.some(
            (category) =>
              category.surface === surface &&
              defaultCategoryIds.has(category.id),
          );
          if (!covered) {
            gaps.push(
              `${style.name.en} / ${roomType.name.en}: no default for surface ${surface}`,
            );
          }
        }
      }
    }

    expect(gaps).toEqual([]);
  });

  it('use categories of the room type and products of the category', () => {
    const mismatches: string[] = [];
    const roomTypeById = new Map(
      roomTypes.map((roomType) => [roomType.id, roomType]),
    );

    for (const style of styles) {
      for (const material of style.defaultMaterials) {
        const roomType = roomTypeById.get(material.roomTypeId);
        const label = `${style.name.en} / ${roomType?.name.en ?? material.roomTypeId} / ${categoryLabel(material.categoryId)}`;

        if (!roomType?.categoryIds.includes(material.categoryId)) {
          mismatches.push(`${label}: category is not part of the room type`);
        }
        if (
          productById.get(material.productId)?.categoryId !==
          material.categoryId
        ) {
          mismatches.push(`${label}: product does not belong to the category`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
