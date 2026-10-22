import { Controller, Post } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { Idempotent } from './idempotent.decorator';

@Controller('test')
class TestController {
  @Post()
  @Idempotent(IdempotencyScope.LEAD)
  create() {
    return undefined;
  }
}

describe('Idempotent', () => {
  const handler = TestController.prototype.create;

  it('stores the scope', () => {
    expect(Reflect.getMetadata(IDEMPOTENCY_SCOPE_KEY, handler)).toBe(
      IdempotencyScope.LEAD,
    );
  });

  it('attaches the interceptor', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toEqual([
      IdempotencyInterceptor,
    ]);
  });

  it('documents the required header', () => {
    expect(Reflect.getMetadata(DECORATORS.API_PARAMETERS, handler)).toEqual([
      expect.objectContaining({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      }),
    ]);
  });
});
