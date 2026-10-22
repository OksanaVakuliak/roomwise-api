import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PublicWriteReplayCheck } from '../../../common/throttling/public-write-replay-check';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyService } from './idempotency.service';
import { readIdempotencyKey } from './idempotency-request';

@Injectable()
export class IdempotencyReplayCheck extends PublicWriteReplayCheck {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
  ) {
    super();
  }

  async isReplay(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<IdempotencyScope | undefined>(
      IDEMPOTENCY_SCOPE_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<Request>();
    const key = readIdempotencyKey(request);

    if (!scope || !key) {
      return false;
    }

    const row = await this.idempotency.find(scope, key);

    return row?.requestHash === this.idempotency.hashRequest(request.body);
  }
}
