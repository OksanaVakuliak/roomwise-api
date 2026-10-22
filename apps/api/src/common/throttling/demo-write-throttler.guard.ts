import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { hours } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedAdmin } from '../../modules/auth/current-admin.decorator';
import {
  DEMO_UPLOADS_PER_HOUR,
  DEMO_WRITES_PER_HOUR,
} from './demo-throttle.constants';
import { NamedThrottlerGuard } from './named-throttler.guard';

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
export class DemoWriteThrottlerGuard extends NamedThrottlerGuard {
  async onModuleInit(): Promise<void> {
    this.useThrottlers([
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
    ]);
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
}
