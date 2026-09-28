import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { SurfaceKind } from '../../../../generated/prisma/enums';
import { CATEGORY_WASTE_PERCENT_MAX } from './category-admin.schema';

export const patchCategorySchema = z.object({
  name: localizedNameDraftSchema.optional(),
  wastePercent: z.number().min(0).max(CATEGORY_WASTE_PERCENT_MAX).optional(),
  surface: z.enum(SurfaceKind).optional(),
  revision: z.uuid(),
});

export type PatchCategoryInput = z.infer<typeof patchCategorySchema>;

export class PatchCategoryDto extends createZodDto(patchCategorySchema) {}
