import type { ErrorCode } from './error-codes';

export interface ErrorField {
  path: string;
  code: string;
  params?: Record<string, unknown>;
}

export interface AppErrorOptions {
  params?: Record<string, unknown>;
  fields?: ErrorField[];
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params?: Record<string, unknown>;
  readonly fields?: ErrorField[];

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(code, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.params = options.params;
    this.fields = options.fields;
  }
}
