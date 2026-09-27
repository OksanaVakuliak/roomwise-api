import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, type Observable, switchMap } from 'rxjs';
import { Clock } from '../../common/clock/clock';
import { SandboxSchedule } from './sandbox-schedule';

const ADMIN_PATH = /\/admin(?:\/|$)/;

@Injectable()
export class SandboxCatchUpInterceptor implements NestInterceptor {
  constructor(
    @Inject(SandboxSchedule) private readonly schedule: SandboxSchedule,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!ADMIN_PATH.test(request.path)) {
      return next.handle();
    }

    return from(this.schedule.catchUp(this.clock.now())).pipe(
      switchMap(() => next.handle()),
    );
  }
}
