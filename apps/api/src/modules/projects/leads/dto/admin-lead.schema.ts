import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '../../../../common/i18n/resolve-lang';
import {
  paginatedResponseSchema,
  paginationQuerySchema,
} from '../../../../common/pagination/pagination.schema';
import { LeadStatus } from '../../../../generated/prisma/enums';
import { versionViewSchema } from '../../presenters/version-view.schema';

const NOTE_TEXT_MAX = 2000;

const adminRefSchema = z.object({ id: z.uuid(), login: z.string() });

export const leadStatusSchema = z.enum(LeadStatus);

export const leadIdParamSchema = z.object({ id: z.uuid() });

export const leadListQuerySchema = paginationQuerySchema.extend({
  status: leadStatusSchema.optional(),
});

export const leadListItemSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  createdAt: z.iso.datetime(),
  status: leadStatusSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  expiredAtSubmission: z.boolean(),
  totalUsdCents: z.number().int(),
  masked: z.boolean(),
});

export const leadListResponseSchema =
  paginatedResponseSchema(leadListItemSchema);

export const leadNoteSchema = z.object({
  id: z.uuid(),
  text: z.string().nullable(),
  createdAt: z.iso.datetime(),
  author: adminRefSchema.nullable(),
});

export const leadStatusChangeSchema = z.object({
  fromStatus: leadStatusSchema.nullable(),
  toStatus: leadStatusSchema,
  changedAt: z.iso.datetime(),
  changedBy: adminRefSchema.nullable(),
});

export const leadAdminSchema = leadListItemSchema.extend({
  comment: z.string().nullable(),
  consentText: z.string().nullable(),
  consentAt: z.iso.datetime(),
  locale: z.enum(SUPPORTED_LANGUAGES),
  revision: z.uuid(),
  statusHistory: z.array(leadStatusChangeSchema),
  notes: z.array(leadNoteSchema),
  calculation: versionViewSchema,
});

export const changeLeadStatusSchema = z.object({
  status: leadStatusSchema,
  revision: z.uuid(),
});

export const addLeadNoteSchema = z.object({
  text: z.string().trim().min(1).max(NOTE_TEXT_MAX),
});

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadListItem = z.infer<typeof leadListItemSchema>;
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;
export type LeadNote = z.infer<typeof leadNoteSchema>;
export type LeadAdmin = z.infer<typeof leadAdminSchema>;
export type ChangeLeadStatusInput = z.infer<typeof changeLeadStatusSchema>;
export type AddLeadNoteInput = z.infer<typeof addLeadNoteSchema>;

export class LeadIdParamDto extends createZodDto(leadIdParamSchema) {}
export class LeadListQueryDto extends createZodDto(leadListQuerySchema) {}
export class LeadListResponseDto extends createZodDto(leadListResponseSchema) {}
export class LeadNoteDto extends createZodDto(leadNoteSchema) {}
export class LeadAdminDto extends createZodDto(leadAdminSchema) {}
export class ChangeLeadStatusDto extends createZodDto(changeLeadStatusSchema) {}
export class AddLeadNoteDto extends createZodDto(addLeadNoteSchema) {}
