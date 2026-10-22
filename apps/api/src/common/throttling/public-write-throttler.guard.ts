import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import {
  hours,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import type { Response } from 'express';
import { PUBLIC_WRITE_LIMIT_KEY } from './public-write-limit.decorator';
import {
  LEADS_PER_HOUR,
  type PublicWriteLimitName,
  SAVES_PER_HOUR,
} from './public-write-throttle.constants';

@Injectable()
export class PublicWriteThrottlerGuard extends ThrottlerGuard {
  async onModuleInit(): Promise<void> {
    this.throttlers = [
      {
        name: 'saves',
        ttl: hours(1),
        limit: SAVES_PER_HOUR,
        skipIf: (context) => !this.hasLimit(context, 'saves'),
      },
      {
        name: 'leads',
        ttl: hours(1),
        limit: LEADS_PER_HOUR,
        skipIf: (context) => !this.hasLimit(context, 'leads'),
      },
    ];
    this.commonOptions = {
      getTracker: (req) => this.getTracker(req),
      generateKey: (context, tracker, name) =>
        this.generateKey(context, tracker, name),
    };
  }

  private hasLimit(
    context: ExecutionContext,
    name: PublicWriteLimitName,
  ): boolean {
    return (
      this.reflector.getAllAndOverride<PublicWriteLimitName | undefined>(
        PUBLIC_WRITE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      ) === name
    );
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
