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
} from './create-option.schema';

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
    roomTypeIds: z.array(z.uuid()).optional(),
    revision: z.uuid(),
  })
  .strict();

export type PatchOptionInput = z.infer<typeof patchOptionSchema>;

export class PatchOptionDto extends createZodDto(patchOptionSchema) {}
