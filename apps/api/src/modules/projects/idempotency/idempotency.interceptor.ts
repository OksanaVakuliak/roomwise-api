import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import {
  catchError,
  from,
  map,
  type Observable,
  switchMap,
  throwError,
} from 'rxjs';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { IdempotencyKey } from '../../../generated/prisma/client';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyService } from './idempotency.service';
import type { IdempotentRequest } from './idempotency-request';

function isKeyConflict(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT
  );
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.get<IdempotencyScope>(
      IDEMPOTENCY_SCOPE_KEY,
      context.getHandler(),
    );
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const response = http.getResponse<Response>();

    const replay = (row: IdempotencyKey, requestHash: string) => {
      if (row.requestHash !== requestHash) {
        return throwError(
          () => new AppError(ERROR_CODES.IDEMPOTENCY_KEY_REUSED),
        );
      }

      return from(this.idempotency.replay(row, request)).pipe(
        map(({ status, body }) => {
          response.status(status);
          return body;
        }),
      );
    };

    return from(this.idempotency.lookup(request, scope)).pipe(
      switchMap((lookup) => {
        if (!lookup) {
          return throwError(
            () => new AppError(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED),
          );
        }

        const { key, requestHash, row } = lookup;

        if (row) {
          return replay(row, requestHash);
        }

        request.idempotency = { scope, key, requestHash };

        return next.handle().pipe(
          catchError((error: unknown) => {
            if (!isKeyConflict(error)) {
              return throwError(() => error);
            }

            return from(this.idempotency.find(scope, key)).pipe(
              switchMap((stored) =>
                stored ? replay(stored, requestHash) : throwError(() => error),
              ),
            );
          }),
        );
      }),
    );
  }
}
