import type { ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { hours } from '@nestjs/throttler';
import { NamedThrottlerGuard } from './named-throttler.guard';
import { PublicWriteExemption } from './public-write-exemption';
import { PUBLIC_WRITE_LIMIT_KEY } from './public-write-limit.decorator';
import {
  PUBLIC_WRITE_LIMITS_PER_HOUR,
  type PublicWriteLimitName,
} from './public-write-throttle.constants';

@Injectable()
export class PublicWriteThrottlerGuard extends NamedThrottlerGuard {
  @Optional()
  @Inject(PublicWriteExemption)
  private readonly exemption?: PublicWriteExemption;

  async onModuleInit(): Promise<void> {
    this.useThrottlers(
      (
        Object.entries(PUBLIC_WRITE_LIMITS_PER_HOUR) as [
          PublicWriteLimitName,
          number,
        ][]
      ).map(([name, limit]) => ({
        name,
        ttl: hours(1),
        limit,
        skipIf: (context) => this.getLimitName(context) !== name,
      })),
    );
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (this.getLimitName(context) === undefined) {
      return true;
    }

    return (await this.exemption?.isExempt(context)) ?? false;
  }

  private getLimitName(
    context: ExecutionContext,
  ): PublicWriteLimitName | undefined {
    return this.reflector.getAllAndOverride<PublicWriteLimitName | undefined>(
      PUBLIC_WRITE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
  }
}
