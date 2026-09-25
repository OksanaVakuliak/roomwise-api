import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import { OptionUnit } from '../../../../generated/prisma/enums';

export const patchEngineeringPackageItemSchema = z.object({
  name: localizedNameDraftSchema.optional(),
  description: localizedDescriptionDraftSchema.optional(),
  includedInBase: z.boolean().optional(),
  priceCents: z.number().int().nonnegative().nullable().optional(),
  unit: z.enum(OptionUnit).nullable().optional(),
  revision: z.uuid(),
});

export type PatchEngineeringPackageItemInput = z.infer<
  typeof patchEngineeringPackageItemSchema
>;

export class PatchEngineeringPackageItemDto extends createZodDto(
  patchEngineeringPackageItemSchema,
) {}
