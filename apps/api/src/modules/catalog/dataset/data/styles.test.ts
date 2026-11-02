import { describe, expect, it } from 'vitest';
import { SurfaceKind } from '../../../../generated/prisma/enums';
import { categories } from './categories';
import { roomTypes } from './room-types';
import { styles } from './styles';

const categoryById = new Map(
  categories.map((category) => [category.id, category]),
);

describe('style default materials', () => {
  it('cover every room type', () => {
    const gaps: string[] = [];

    for (const style of styles) {
      for (const roomType of roomTypes) {
        const label = `${style.name.en} / ${roomType.name.en}`;
        const defaultCategoryIds = new Set(
          style.defaultMaterials
            .filter((material) => material.roomTypeId === roomType.id)
            .map((material) => material.categoryId),
        );
        const roomCategories = roomType.categoryIds.flatMap((categoryId) => {
          const category = categoryById.get(categoryId);
          if (!category) {
            gaps.push(`${label}: unknown category ${categoryId}`);
            return [];
          }
          return [category];
        });

        for (const category of roomCategories) {
          if (
            category.surface === SurfaceKind.NONE &&
            !defaultCategoryIds.has(category.id)
          ) {
            gaps.push(`${label}: no default for category ${category.name.en}`);
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
            gaps.push(`${label}: no default for surface ${surface}`);
          }
        }
      }
    }

    expect(gaps).toEqual([]);
  });
});
