import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { from, type Observable, of, switchMap } from 'rxjs';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyService } from './idempotency.service';
import {
  type IdempotentRequest,
  readIdempotencyKey,
} from './idempotency-request';

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
    const key = readIdempotencyKey(request);

    if (!key) {
      throw new AppError(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED);
    }

    const requestHash = this.idempotency.hashRequest(request.body);

    return from(this.idempotency.find(scope, key)).pipe(
      switchMap(async (row) => {
        if (!row) {
          request.idempotency = { scope, key, requestHash };

          return null;
        }

        if (row.requestHash !== requestHash) {
          throw new AppError(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
        }

        return this.idempotency.replay(row);
      }),
      switchMap((replay) => {
        if (!replay) {
          return next.handle();
        }

        http.getResponse<Response>().status(replay.status);

        return of(replay.body);
      }),
    );
  }
}
