import type { ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { Response } from 'express';

export abstract class NamedThrottlerGuard extends ThrottlerGuard {
  protected useThrottlers(throttlers: ThrottlerOptions[]): void {
    this.throttlers = throttlers;
    this.commonOptions = {
      getTracker: (req) => this.getTracker(req),
      generateKey: (context, tracker, name) =>
        this.generateKey(context, tracker, name),
    };
  }

  protected generateKey(
    _context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    return `${name}:${tracker}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    (res as Response).header(
      'Retry-After',
      String(throttlerLimitDetail.timeToBlockExpire),
    );

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
