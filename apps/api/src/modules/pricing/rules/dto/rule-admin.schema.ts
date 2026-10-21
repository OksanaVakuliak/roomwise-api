import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';
import { RuleLevel } from '../../../../generated/prisma/enums';

export const ruleAdminSchema = z
  .object({
    id: z.uuid(),
    level: z.enum(RuleLevel),
    categoryId: z.uuid().nullable(),
    materialTypeId: z.uuid().nullable(),
    name: localizedNameDraftSchema,
    quantityFormula: z.string().nullable(),
    costFormula: z.string(),
    coefficientKeys: z.array(z.string()),
    sortOrder: z.int(),
    orphaned: z.boolean(),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const ruleListResponseSchema = z.object({
  items: z.array(ruleAdminSchema),
  categoriesWithoutRule: z.array(
    z.object({ id: z.uuid(), name: localizedNameDraftSchema }),
  ),
});

export type RuleAdmin = z.infer<typeof ruleAdminSchema>;
export type RuleListResponse = z.infer<typeof ruleListResponseSchema>;

export class RuleAdminDto extends createZodDto(ruleAdminSchema) {}

export class RuleListResponseDto extends createZodDto(ruleListResponseSchema) {}
