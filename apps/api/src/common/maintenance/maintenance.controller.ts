import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../modules/auth/public.decorator';
import { Clock } from '../clock/clock';
import { ErrorResponseDto } from '../http/error-response.dto';
import {
  type MaintenanceRunResponse,
  MaintenanceRunResponseDto,
} from './maintenance.schema';
import { MaintenanceRegistry } from './maintenance-registry';
import { MaintenanceTokenGuard } from './maintenance-token.guard';

@Controller('internal/maintenance')
export class MaintenanceController {
  constructor(
    private readonly registry: MaintenanceRegistry,
    private readonly clock: Clock,
  ) {}

  @Public()
  @UseGuards(MaintenanceTokenGuard)
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: HttpStatus.OK, type: MaintenanceRunResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'UNAUTHENTICATED',
    type: ErrorResponseDto,
  })
  async run(): Promise<MaintenanceRunResponse> {
    const tasks = await this.registry.runDue(this.clock.now());

    return { tasks };
  }
}
