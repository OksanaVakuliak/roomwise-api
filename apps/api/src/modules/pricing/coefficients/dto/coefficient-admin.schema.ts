import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';

export const coefficientUsageSchema = z.object({
  ruleId: z.uuid(),
  ruleName: localizedNameDraftSchema,
});

export const coefficientAdminSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    name: localizedNameDraftSchema,
    value: z.number(),
    unit: localizedNameDraftSchema,
    usedBy: z.array(coefficientUsageSchema),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const coefficientListResponseSchema = z.object({
  items: z.array(coefficientAdminSchema),
});

export type CoefficientUsage = z.infer<typeof coefficientUsageSchema>;
export type CoefficientAdmin = z.infer<typeof coefficientAdminSchema>;
export type CoefficientListResponse = z.infer<
  typeof coefficientListResponseSchema
>;

export class CoefficientAdminDto extends createZodDto(coefficientAdminSchema) {}

export class CoefficientListResponseDto extends createZodDto(
  coefficientListResponseSchema,
) {}
