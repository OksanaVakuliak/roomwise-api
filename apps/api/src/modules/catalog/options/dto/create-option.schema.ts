import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { OptionKind, OptionUnit } from '../../../../generated/prisma/enums';

export const OPTION_QUANTITY_MIN = 1;
export const OPTION_QUANTITY_MAX = 100;

const DUPLICATE_ROOM_TYPE_ID_MESSAGE = 'Duplicate room type id';
const MIN_QUANTITY_EXCEEDS_MAX_QUANTITY_MESSAGE =
  'minQuantity must not exceed maxQuantity';

export const roomTypeIdsSchema = z
  .array(z.uuid())
  .superRefine((roomTypeIds, ctx) => {
    const seen = new Set<string>();

    for (const roomTypeId of roomTypeIds) {
      if (seen.has(roomTypeId)) {
        ctx.addIssue({
          code: 'custom',
          message: DUPLICATE_ROOM_TYPE_ID_MESSAGE,
          path: [],
        });
      }
      seen.add(roomTypeId);
    }
  });

export const createOptionSchema = z
  .object({
    kind: z.enum(OptionKind),
    name: localizedNameDraftSchema,
    description: localizedDescriptionDraftSchema,
    imageId: z.uuid().optional(),
    priceCents: z.number().int().min(0),
    confirmZeroPrice: z.boolean().default(false),
    unit: z.enum(OptionUnit),
    minQuantity: z
      .number()
      .int()
      .min(OPTION_QUANTITY_MIN)
      .max(OPTION_QUANTITY_MAX)
      .optional(),
    maxQuantity: z
      .number()
      .int()
      .min(OPTION_QUANTITY_MIN)
      .max(OPTION_QUANTITY_MAX)
      .optional(),
    roomTypeIds: roomTypeIdsSchema,
  })
  .superRefine((data, ctx) => {
    if (
      data.minQuantity !== undefined &&
      data.maxQuantity !== undefined &&
      data.minQuantity > data.maxQuantity
    ) {
      ctx.addIssue({
        code: 'custom',
        message: MIN_QUANTITY_EXCEEDS_MAX_QUANTITY_MESSAGE,
        path: ['maxQuantity'],
      });
    }
  });

export type CreateOptionInput = z.infer<typeof createOptionSchema>;

export class CreateOptionDto extends createZodDto(createOptionSchema) {}
