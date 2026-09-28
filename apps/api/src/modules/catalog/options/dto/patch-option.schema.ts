import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { OptionKind, OptionUnit } from '../../../../generated/prisma/enums';
import {
  OPTION_QUANTITY_MAX,
  OPTION_QUANTITY_MIN,
  roomTypeIdsSchema,
} from './create-option.schema';

const MIN_QUANTITY_EXCEEDS_MAX_QUANTITY_MESSAGE =
  'minQuantity must not exceed maxQuantity';

export const patchOptionSchema = z
  .object({
    kind: z.enum(OptionKind).optional(),
    name: localizedNameDraftSchema.optional(),
    description: localizedDescriptionDraftSchema.optional(),
    imageId: z.uuid().nullable().optional(),
    priceCents: z.number().int().min(0).optional(),
    confirmZeroPrice: z.boolean().optional(),
    unit: z.enum(OptionUnit).optional(),
    minQuantity: z
      .number()
      .int()
      .min(OPTION_QUANTITY_MIN)
      .max(OPTION_QUANTITY_MAX)
      .nullable()
      .optional(),
    maxQuantity: z
      .number()
      .int()
      .min(OPTION_QUANTITY_MIN)
      .max(OPTION_QUANTITY_MAX)
      .nullable()
      .optional(),
    roomTypeIds: roomTypeIdsSchema.optional(),
    revision: z.uuid(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.minQuantity !== undefined &&
      data.minQuantity !== null &&
      data.maxQuantity !== undefined &&
      data.maxQuantity !== null &&
      data.minQuantity > data.maxQuantity
    ) {
      ctx.addIssue({
        code: 'custom',
        message: MIN_QUANTITY_EXCEEDS_MAX_QUANTITY_MESSAGE,
        path: ['maxQuantity'],
      });
    }
  });

export type PatchOptionInput = z.infer<typeof patchOptionSchema>;

export class PatchOptionDto extends createZodDto(patchOptionSchema) {}
