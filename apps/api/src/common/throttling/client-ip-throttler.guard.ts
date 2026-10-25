import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeIp, ThrottlerGuard } from '@nestjs/throttler';
import type { AppEnv } from '../../config/env';
import { type ClientIpRequest, resolveClientIp } from './client-ip';

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  @Optional()
  @Inject(ConfigService)
  private readonly config?: ConfigService<AppEnv, true>;

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const clientIp = resolveClientIp(
      req as unknown as ClientIpRequest,
      this.config?.get('API_PROXY_SECRET', { infer: true }),
    );

    return normalizeIp(clientIp, this.ipv6SubnetPrefix);
  }
}
