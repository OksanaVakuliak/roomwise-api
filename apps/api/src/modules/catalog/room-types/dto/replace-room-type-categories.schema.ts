import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DUPLICATE_CATEGORY_ID_MESSAGE = 'Duplicate category id';

export const replaceRoomTypeCategoriesSchema = z.object({
  categoryIds: z.array(z.uuid()).superRefine((categoryIds, ctx) => {
    const seen = new Set<string>();

    categoryIds.forEach((categoryId, index) => {
      if (seen.has(categoryId)) {
        ctx.addIssue({
          code: 'custom',
          message: DUPLICATE_CATEGORY_ID_MESSAGE,
          path: [index],
        });
      }
      seen.add(categoryId);
    });
  }),
  revision: z.uuid(),
});

export type ReplaceRoomTypeCategoriesInput = z.infer<
  typeof replaceRoomTypeCategoriesSchema
>;

export class ReplaceRoomTypeCategoriesDto extends createZodDto(
  replaceRoomTypeCategoriesSchema,
) {}
