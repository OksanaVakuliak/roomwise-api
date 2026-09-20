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
  DEMO_FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  STALE_REVISION: HttpStatus.CONFLICT,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  TRANSLATION_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

const HTTP_STATUS_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.DEMO_FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.STALE_REVISION,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODES.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

function zodIssueCode(issue: ZodIssue): string {
  if (issue.code === 'too_small') {
    return 'TOO_SHORT';
  }

  if (issue.code === 'too_big') {
    return 'TOO_LONG';
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
    this.logger.error('Unhandled exception');
    this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, {
      error: { code: ERROR_CODES.INTERNAL },
    });
  }

  private send(
    response: Response,
    status: number,
    envelope: ErrorEnvelope,
  ): void {
    response.status(status).json(envelope);
  }
}
