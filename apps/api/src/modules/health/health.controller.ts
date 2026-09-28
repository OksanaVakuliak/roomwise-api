import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../auth/public.decorator';
import { HealthResponseDto } from './health.schema';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ZodResponse({ status: 200, type: HealthResponseDto })
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponseDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.healthService.check();
  }
}
