import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { SurfaceKind } from '../../../../generated/prisma/enums';
import { CATEGORY_WASTE_PERCENT_MAX } from './category-admin.schema';

export const createCategorySchema = z.object({
  name: localizedNameDraftSchema,
  wastePercent: z.number().min(0).max(CATEGORY_WASTE_PERCENT_MAX),
  surface: z.enum(SurfaceKind),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
