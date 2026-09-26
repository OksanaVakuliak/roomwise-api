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

export const createEngineeringPackageItemSchema = z
  .object({
    name: localizedNameDraftSchema,
    description: localizedDescriptionDraftSchema,
    includedInBase: z.boolean(),
    priceCents: z.number().int().nonnegative().optional(),
    unit: z.enum(OptionUnit).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.includedInBase) {
      return;
    }

    if (data.priceCents !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: INCLUDED_ITEM_PRICE_MESSAGE,
        path: ['priceCents'],
      });
    }

    if (data.unit !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: INCLUDED_ITEM_UNIT_MESSAGE,
        path: ['unit'],
      });
    }
  });

export type CreateEngineeringPackageItemInput = z.infer<
  typeof createEngineeringPackageItemSchema
>;

export class CreateEngineeringPackageItemDto extends createZodDto(
  createEngineeringPackageItemSchema,
) {}
