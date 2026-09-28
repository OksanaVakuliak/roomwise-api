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
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionService } from './session.service';
import { SessionCookieService } from './session-cookie';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionCookieService: SessionCookieService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { admin: AuthenticatedAdmin }>();

    const sid = await this.sessionCookieService.readSid(request);
    if (!sid) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED);
    }

    const validated = await this.sessionService.validate(sid);
    if (!validated) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED);
    }

    request.admin = {
      id: validated.admin.id,
      login: validated.admin.login,
      isDemo: validated.admin.isDemo,
      sessionId: validated.session.id,
    };

    return true;
  }
}
