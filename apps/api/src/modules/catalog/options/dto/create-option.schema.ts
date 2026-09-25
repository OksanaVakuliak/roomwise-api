import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { OptionKind, OptionUnit } from '../../../../generated/prisma/enums';

export const OPTION_QUANTITY_MIN = 1;
export const OPTION_QUANTITY_MAX = 100;

export const createOptionSchema = z.object({
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
  roomTypeIds: z.array(z.uuid()),
});

export type CreateOptionInput = z.infer<typeof createOptionSchema>;

export class CreateOptionDto extends createZodDto(createOptionSchema) {}
