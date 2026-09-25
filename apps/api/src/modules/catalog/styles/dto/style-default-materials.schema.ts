import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DUPLICATE_PAIR_MESSAGE = 'Duplicate room type and category pair';

export const styleDefaultMaterialItemSchema = z.object({
  roomTypeId: z.uuid(),
  categoryId: z.uuid(),
  productId: z.uuid().nullable(),
});

export const styleDefaultMaterialsSchema = z.object({
  items: z.array(styleDefaultMaterialItemSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();

    items.forEach((item, index) => {
      const key = `${item.roomTypeId}:${item.categoryId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: DUPLICATE_PAIR_MESSAGE,
          path: [index],
        });
      }
      seen.add(key);
    });
  }),
  revision: z.uuid(),
});

export type StyleDefaultMaterialItemInput = z.infer<
  typeof styleDefaultMaterialItemSchema
>;
export type StyleDefaultMaterialsInput = z.infer<
  typeof styleDefaultMaterialsSchema
>;

export class StyleDefaultMaterialsDto extends createZodDto(
  styleDefaultMaterialsSchema,
) {}
