import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppEnv } from '../../config/env';
import { AppError } from '../http/app-error';
import { ERROR_CODES } from '../http/error-codes';

const MAINTENANCE_TOKEN_HEADER = 'x-maintenance-token';

function hash(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

@Injectable()
export class MaintenanceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header(MAINTENANCE_TOKEN_HEADER);

    if (!provided || !this.isValidToken(provided)) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED);
    }

    return true;
  }

  private isValidToken(provided: string): boolean {
    const expected = this.config.get('MAINTENANCE_TOKEN', { infer: true });

    return timingSafeEqual(hash(provided), hash(expected));
  }
}
