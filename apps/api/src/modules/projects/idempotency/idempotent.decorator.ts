import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_SCOPE_KEY,
} from './idempotency.constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { IdempotentRequest } from './idempotency-request';

export const Idempotent = (scope: IdempotencyScope) =>
  applyDecorators(
    SetMetadata(IDEMPOTENCY_SCOPE_KEY, scope),
    ApiHeader({
      name: IDEMPOTENCY_HEADER,
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }),
    UseInterceptors(IdempotencyInterceptor),
  );

export const IdempotencyContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<IdempotentRequest>().idempotency,
);
