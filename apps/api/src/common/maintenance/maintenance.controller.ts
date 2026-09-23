import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../modules/auth/public.decorator';
import {
  type MaintenanceRunResponse,
  MaintenanceRunResponseDto,
} from './maintenance.schema';
import { MaintenanceRegistry } from './maintenance-registry';
import { MaintenanceTokenGuard } from './maintenance-token.guard';

@Controller('internal/maintenance')
export class MaintenanceController {
  constructor(private readonly registry: MaintenanceRegistry) {}

  @Public()
  @UseGuards(MaintenanceTokenGuard)
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: HttpStatus.OK, type: MaintenanceRunResponseDto })
  async run(): Promise<MaintenanceRunResponse> {
    const tasks = await this.registry.runDue(new Date());

    return { tasks };
  }
}
