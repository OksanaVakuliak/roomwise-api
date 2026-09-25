import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { OptionUnit } from '../../../../generated/prisma/enums';

export const createEngineeringPackageItemSchema = z.object({
  name: localizedNameDraftSchema,
  description: localizedDescriptionDraftSchema,
  includedInBase: z.boolean(),
  priceCents: z.number().int().nonnegative().optional(),
  unit: z.enum(OptionUnit).optional(),
});

export type CreateEngineeringPackageItemInput = z.infer<
  typeof createEngineeringPackageItemSchema
>;

export class CreateEngineeringPackageItemDto extends createZodDto(
  createEngineeringPackageItemSchema,
) {}
