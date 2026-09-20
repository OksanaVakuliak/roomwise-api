import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from './app-error';
import { ERROR_CODES } from './error-codes';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost(retryAfter?: string): {
  host: ArgumentsHost;
  response: Pick<Response, 'getHeader' | 'json' | 'setHeader' | 'status'>;
} {
  const response = {
    getHeader: vi.fn().mockReturnValue(retryAfter),
    json: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn(),
  };
  response.status.mockReturnValue(response);

  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('HttpExceptionFilter', () => {
  it('maps zod issues to validation fields', () => {
    const { host, response } = createHost();
    const filter = new HttpExceptionFilter();
    const result = z.object({ name: z.string().min(2) }).safeParse({
      name: '',
    });

    if (result.success) {
      throw new Error('Expected validation to fail');
    }

    filter.catch(new ZodValidationException(result.error), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        fields: [
          {
            path: 'name',
            code: 'TOO_SHORT',
            params: { min: 2 },
          },
        ],
      },
    });
  });

  it('maps transport-neutral app errors to the API envelope', () => {
    const { host, response } = createHost();
    const filter = new HttpExceptionFilter();

    filter.catch(
      new AppError(ERROR_CODES.STALE_REVISION, {
        params: { currentRevision: 'revision-2' },
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'STALE_REVISION',
        params: { currentRevision: 'revision-2' },
        fields: undefined,
      },
    });
  });

  it('preserves throttler retry timing without exposing its message', () => {
    const { host, response } = createHost('42');
    const filter = new HttpExceptionFilter();

    filter.catch(new ThrottlerException(), host);

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 42);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMITED',
        params: { retryAfterSeconds: 42 },
      },
    });
  });
});
