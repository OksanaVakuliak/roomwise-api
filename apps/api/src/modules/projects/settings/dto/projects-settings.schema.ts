import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import { localizedDescriptionSchema } from '../../../../common/i18n/localized-text.schema';

const MAX_DAYS = 365;
const daysSchema = z.number().int().min(1).max(MAX_DAYS);

export const projectsSettingsAdminSchema = z
  .object({
    calculationValidityDays: daysSchema,
    leadRetentionDays: daysSchema,
    leadFormNotice: localizedDescriptionSchema,
    lastRetentionRunAt: z.iso.datetime().nullable(),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const patchProjectsSettingsSchema = z
  .object({
    calculationValidityDays: daysSchema.optional(),
    leadRetentionDays: daysSchema.optional(),
    leadFormNotice: localizedDescriptionSchema.optional(),
    revision: z.uuid(),
  })
  .strict();

export type ProjectsSettingsAdmin = z.infer<typeof projectsSettingsAdminSchema>;
export type PatchProjectsSettingsInput = z.infer<
  typeof patchProjectsSettingsSchema
>;

export class ProjectsSettingsAdminDto extends createZodDto(
  projectsSettingsAdminSchema,
) {}

export class PatchProjectsSettingsDto extends createZodDto(
  patchProjectsSettingsSchema,
) {}
