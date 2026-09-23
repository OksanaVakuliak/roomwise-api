import {
  ADMIN_LOGIN_MAX_LENGTH,
  ADMIN_LOGIN_MIN_LENGTH,
  ADMIN_PASSWORD_MAX_LENGTH,
  ADMIN_PASSWORD_MIN_LENGTH,
  adminLoginSchema,
  adminPasswordSchema,
} from './auth.schemas';

export const USAGE_MESSAGE =
  'Usage: pnpm --filter api admin:create --login <value>';

const LOGIN_FLAG = '--login';
const LOGIN_FLAG_PREFIX = '--login=';

export function parseLoginArg(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === LOGIN_FLAG) {
      return argv[index + 1];
    }

    if (arg.startsWith(LOGIN_FLAG_PREFIX)) {
      return arg.slice(LOGIN_FLAG_PREFIX.length);
    }
  }

  return undefined;
}

export interface ValidateCredentialsSuccess {
  readonly login: string;
}

export interface ValidateCredentialsFailure {
  readonly errors: readonly string[];
}

export type ValidateCredentialsResult =
  | ValidateCredentialsSuccess
  | ValidateCredentialsFailure;

export function validateCredentials(
  login: string,
  password: string,
): ValidateCredentialsResult {
  const errors: string[] = [];

  const loginResult = adminLoginSchema.safeParse(login);
  if (!loginResult.success) {
    errors.push(
      `Invalid login: must be ${ADMIN_LOGIN_MIN_LENGTH}-${ADMIN_LOGIN_MAX_LENGTH} characters of lowercase letters, digits, dots, underscores, or hyphens.`,
    );
  }

  const passwordResult = adminPasswordSchema.safeParse(password);
  if (!passwordResult.success) {
    errors.push(
      `Invalid password: must be ${ADMIN_PASSWORD_MIN_LENGTH}-${ADMIN_PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  if (
    loginResult.success &&
    passwordResult.success &&
    password.toLowerCase() === loginResult.data.toLowerCase()
  ) {
    errors.push('Password must not be the same as the login.');
  }

  if (!loginResult.success || errors.length > 0) {
    return { errors };
  }

  return { login: loginResult.data };
}
