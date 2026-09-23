import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../modules/auth/public.decorator';
import {
  type MaintenanceRunResponse,
  MaintenanceRunResponseDto,
} from './maintenance.schema';
import { MaintenanceRegistry } from './maintenance-registry';
import { MaintenanceTokenGuard } from './maintenance-token.guard';

const RUN_RESPONSE_STATUS = 200;

@Controller('internal/maintenance')
export class MaintenanceController {
  constructor(private readonly registry: MaintenanceRegistry) {}

  @Public()
  @UseGuards(MaintenanceTokenGuard)
  @Post('run')
  @HttpCode(RUN_RESPONSE_STATUS)
  @ZodResponse({ status: RUN_RESPONSE_STATUS, type: MaintenanceRunResponseDto })
  async run(): Promise<MaintenanceRunResponse> {
    const tasks = await this.registry.runDue(new Date());

    return { tasks };
  }
}
