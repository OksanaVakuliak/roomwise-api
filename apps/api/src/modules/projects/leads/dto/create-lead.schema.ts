import { ConfigurationSchema, PricingDataSchema } from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '../../../../common/i18n/resolve-lang';

const PUBLIC_ID_MAX = 64;
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const COMMENT_MAX = 1000;
const CONSENT_TEXT_MAX = 2000;

export const leadCalculationRefSchema = z.object({
  publicId: z.string().min(1).max(PUBLIC_ID_MAX),
  versionNumber: z.number().int().min(1),
});

export const leadDraftSchema = z.object({
  configuration: ConfigurationSchema,
  styleId: z.uuid(),
  clientPricingVersion: PricingDataSchema.shape.version,
});

export const createLeadRequestSchema = z
  .object({
    calculation: leadCalculationRefSchema.optional(),
    draft: leadDraftSchema.optional(),
    name: z.string().trim().min(1).max(NAME_MAX),
    phone: z.string().min(1),
    email: z.email().max(EMAIL_MAX).optional(),
    comment: z.string().max(COMMENT_MAX).optional(),
    consent: z.object({
      accepted: z.literal(true),
      text: z.string().min(1).max(CONSENT_TEXT_MAX),
    }),
    locale: z.enum(SUPPORTED_LANGUAGES),
    website: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.calculation === undefined) === (value.draft === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['calculation'],
        message: 'Exactly one of calculation or draft is required',
      });
    }
  });

export const createLeadResponseSchema = z.object({
  leadNumber: z.number().int(),
  calculation: leadCalculationRefSchema,
  expiredAtSubmission: z.boolean(),
});

export const leadFormSettingsSchema = z.object({
  retentionDays: z.number().int(),
  notice: z.string(),
});

export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
export type CreateLeadResponse = z.infer<typeof createLeadResponseSchema>;
export type LeadFormSettings = z.infer<typeof leadFormSettingsSchema>;

export class CreateLeadRequestDto extends createZodDto(
  createLeadRequestSchema,
) {}

export class CreateLeadResponseDto extends createZodDto(
  createLeadResponseSchema,
) {}

export class LeadFormSettingsDto extends createZodDto(leadFormSettingsSchema) {}
