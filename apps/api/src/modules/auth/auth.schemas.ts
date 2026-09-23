import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LOGIN_PATTERN = /^[a-z0-9._-]{3,40}$/;
const LOGIN_MAX_LENGTH = 40;
const LOGIN_PASSWORD_MAX_LENGTH = 128;
const NEW_PASSWORD_MIN_LENGTH = 12;
const NEW_PASSWORD_MAX_LENGTH = 128;

export const adminLoginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(LOGIN_MAX_LENGTH)
  .regex(LOGIN_PATTERN);

export const adminPasswordSchema = z
  .string()
  .min(NEW_PASSWORD_MIN_LENGTH)
  .max(NEW_PASSWORD_MAX_LENGTH);

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().max(LOGIN_MAX_LENGTH),
  password: z.string().max(LOGIN_PASSWORD_MAX_LENGTH),
});

export class LoginDto extends createZodDto(loginSchema) {}

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(LOGIN_PASSWORD_MAX_LENGTH),
  newPassword: adminPasswordSchema,
});

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}

const sandboxSchema = z.object({
  nextResetAt: z.iso.datetime(),
  resetTime: z.string(),
  timezone: z.string(),
});

const demoLimitsSchema = z.object({
  writesPerHour: z.int(),
  uploadsPerHour: z.int(),
});

export const adminMeSchema = z.object({
  id: z.uuid(),
  login: z.string(),
  isDemo: z.boolean(),
  sandbox: sandboxSchema.nullable(),
  demoLimits: demoLimitsSchema.nullable(),
});

export type AdminMe = z.infer<typeof adminMeSchema>;

export class AdminMeDto extends createZodDto(adminMeSchema) {}
