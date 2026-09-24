import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ADMIN_LOGIN_MIN_LENGTH = 3;
export const ADMIN_LOGIN_MAX_LENGTH = 40;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 128;

const LOGIN_PATTERN = new RegExp(
  `^[a-z0-9._-]{${ADMIN_LOGIN_MIN_LENGTH},${ADMIN_LOGIN_MAX_LENGTH}}$`,
);

export const adminLoginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(ADMIN_LOGIN_MAX_LENGTH)
  .regex(LOGIN_PATTERN);

export const adminPasswordSchema = z
  .string()
  .min(ADMIN_PASSWORD_MIN_LENGTH)
  .max(ADMIN_PASSWORD_MAX_LENGTH);

export function isPasswordSameAsLogin(
  password: string,
  login: string,
): boolean {
  return password.toLowerCase() === login.toLowerCase();
}

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().max(ADMIN_LOGIN_MAX_LENGTH),
  password: z.string().max(ADMIN_PASSWORD_MAX_LENGTH),
});

export class LoginDto extends createZodDto(loginSchema) {}

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(ADMIN_PASSWORD_MAX_LENGTH),
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
