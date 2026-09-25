import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError, type ZodIssue } from 'zod';
import { AppError, type ErrorField } from './app-error';
import { ERROR_CODES, type ErrorCode } from './error-codes';

interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    params?: Record<string, unknown>;
    fields?: ErrorField[];
  };
}

const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  ACCOUNT_LOCKED: HttpStatus.LOCKED,
  DEMO_FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  PRODUCT_UNAVAILABLE: HttpStatus.NOT_FOUND,
  STALE_REVISION: HttpStatus.CONFLICT,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  TRANSLATION_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  UNSUPPORTED_IMAGE_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  IMAGE_STORAGE_FAILED: HttpStatus.BAD_GATEWAY,
  CATEGORY_ARCHIVED: HttpStatus.UNPROCESSABLE_ENTITY,
  CATEGORY_IN_USE: HttpStatus.CONFLICT,
  CATEGORY_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  MATERIAL_TYPE_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  IMAGE_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  CODE_TAKEN: HttpStatus.CONFLICT,
  ZERO_PRICE_NOT_CONFIRMED: HttpStatus.UNPROCESSABLE_ENTITY,
  SURFACE_DATA_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  PRIMARY_IMAGE_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  PRODUCT_IN_USE: HttpStatus.CONFLICT,
  STYLE_SET_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  STYLE_IMAGE_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  PAIR_NOT_IN_ROOM_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  PRODUCT_CATEGORY_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CONFLICT: HttpStatus.CONFLICT,
  UNPROCESSABLE: HttpStatus.UNPROCESSABLE_ENTITY,
};

const HTTP_STATUS_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODES.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.UNPROCESSABLE,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

function zodIssueCode(issue: ZodIssue): string {
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    const tooSmall = issue.code === 'too_small';

    if (issue.origin === 'string') {
      return tooSmall ? 'TOO_SHORT' : 'TOO_LONG';
    }

    if (issue.origin === 'array' || issue.origin === 'set') {
      return tooSmall ? 'TOO_FEW' : 'TOO_MANY';
    }

    return tooSmall ? 'TOO_SMALL' : 'TOO_BIG';
  }

  return issue.code.toUpperCase();
}

function zodIssueParams(issue: ZodIssue): Record<string, unknown> | undefined {
  if (issue.code === 'too_small') {
    return { min: issue.minimum };
  }

  if (issue.code === 'too_big') {
    return { max: issue.maximum };
  }

  if (issue.code === 'invalid_type') {
    return { expected: issue.expected };
  }

  return undefined;
}

function validationFields(issues: ZodIssue[]): ErrorField[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: zodIssueCode(issue),
    params: zodIssueParams(issue),
  }));
}

function retryAfterSeconds(response: Response): number {
  const header = response.getHeader('Retry-After');
  const value = Array.isArray(header) ? header[0] : header;
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

@Catch()
export class HttpExceptionFilter
  extends SentryGlobalFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      this.send(response, HttpStatus.BAD_REQUEST, {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          fields:
            zodError instanceof ZodError
              ? validationFields(zodError.issues)
              : [],
        },
      });
      return;
    }

    if (exception instanceof ThrottlerException) {
      const retryAfter = retryAfterSeconds(response);
      response.setHeader('Retry-After', retryAfter);
      this.send(response, HttpStatus.TOO_MANY_REQUESTS, {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          params: { retryAfterSeconds: retryAfter },
        },
      });
      return;
    }

    if (exception instanceof AppError) {
      this.send(response, ERROR_STATUS[exception.code], {
        error: {
          code: exception.code,
          params: exception.params,
          fields: exception.fields,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = HTTP_STATUS_CODE[status] ?? ERROR_CODES.INTERNAL;
      this.send(response, status, { error: { code } });
      return;
    }

    Sentry.captureException(exception);
    this.logger.error(
      exception instanceof Error
        ? exception.message
        : `Unhandled non-error exception: ${String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, {
      error: { code: ERROR_CODES.INTERNAL },
    });
  }

  private send(
    response: Response,
    status: number,
    envelope: ErrorEnvelope,
  ): void {
    if (!response.headersSent) {
      response.removeHeader('Cache-Control');
    }
    response.status(status).json(envelope);
  }
}
