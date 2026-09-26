import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { OptionUnit } from '../../../../generated/prisma/enums';

const INCLUDED_ITEM_PRICE_MESSAGE =
  'Price must not be set when the item is included in base';
const INCLUDED_ITEM_UNIT_MESSAGE =
  'Unit must not be set when the item is included in base';

export const patchEngineeringPackageItemSchema = z
  .object({
    name: localizedNameDraftSchema.optional(),
    description: localizedDescriptionDraftSchema.optional(),
    includedInBase: z.boolean().optional(),
    priceCents: z.number().int().nonnegative().nullable().optional(),
    unit: z.enum(OptionUnit).nullable().optional(),
    revision: z.uuid(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.includedInBase !== true) {
      return;
    }

    if (typeof data.priceCents === 'number') {
      ctx.addIssue({
        code: 'custom',
        message: INCLUDED_ITEM_PRICE_MESSAGE,
        path: ['priceCents'],
      });
    }

    if (typeof data.unit === 'string') {
      ctx.addIssue({
        code: 'custom',
        message: INCLUDED_ITEM_UNIT_MESSAGE,
        path: ['unit'],
      });
    }
  });

export type PatchEngineeringPackageItemInput = z.infer<
  typeof patchEngineeringPackageItemSchema
>;

export class PatchEngineeringPackageItemDto extends createZodDto(
  patchEngineeringPackageItemSchema,
) {}
