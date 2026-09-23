import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/http/app-error';
import { ERROR_CODES } from '../../common/http/error-codes';
import type { AuthenticatedAdmin } from './current-admin.decorator';
import { DENY_DEMO_ACTION_KEY } from './deny-demo.decorator';

@Injectable()
export class DenyDemoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<string>(
      DENY_DEMO_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context
      .switchToHttp()
      .getRequest<Request & { admin: AuthenticatedAdmin }>();

    if (request.admin.isDemo) {
      throw new AppError(ERROR_CODES.DEMO_FORBIDDEN, { params: { action } });
    }

    return true;
  }
}
