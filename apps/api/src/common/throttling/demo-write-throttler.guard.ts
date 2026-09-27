import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import {
  hours,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthenticatedAdmin } from '../../modules/auth/current-admin.decorator';
import {
  DEMO_UPLOADS_PER_HOUR,
  DEMO_WRITES_PER_HOUR,
} from './demo-throttle.constants';

type AdminRequest = Request & { admin?: AuthenticatedAdmin };

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEMO_WRITES_THROTTLER = 'demo-writes';
const DEMO_UPLOADS_THROTTLER = 'demo-uploads';
const IMAGES_UPLOAD_PATH = /\/admin\/images\/?$/;

function isImagesUploadRoute(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<Request>();
  return request.method === 'POST' && IMAGES_UPLOAD_PATH.test(request.path);
}

@Injectable()
export class DemoWriteThrottlerGuard extends ThrottlerGuard {
  async onModuleInit(): Promise<void> {
    this.throttlers = [
      {
        name: DEMO_WRITES_THROTTLER,
        ttl: hours(1),
        limit: DEMO_WRITES_PER_HOUR,
      },
      {
        name: DEMO_UPLOADS_THROTTLER,
        ttl: hours(1),
        limit: DEMO_UPLOADS_PER_HOUR,
        skipIf: (context) => !isImagesUploadRoute(context),
      },
    ];
    this.commonOptions = {
      getTracker: (req) => this.getTracker(req),
      generateKey: (context, tracker, name) =>
        this.generateKey(context, tracker, name),
    };
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();

    if (!request.admin?.isDemo) {
      return true;
    }

    return !MUTATING_METHODS.has(request.method);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return (req as unknown as AdminRequest).admin!.id;
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
