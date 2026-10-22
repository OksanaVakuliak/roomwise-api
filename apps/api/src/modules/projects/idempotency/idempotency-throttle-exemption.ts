import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PublicWriteExemption } from '../../../common/throttling/public-write-exemption';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.constants';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyThrottleExemption extends PublicWriteExemption {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
  ) {
    super();
  }

  async isExempt(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<IdempotencyScope | undefined>(
      IDEMPOTENCY_SCOPE_KEY,
      context.getHandler(),
    );

    if (!scope) {
      return false;
    }

    const lookup = await this.idempotency.lookup(
      context.switchToHttp().getRequest<Request>(),
      scope,
    );

    return lookup === null || lookup.row?.requestHash === lookup.requestHash;
  }
}
