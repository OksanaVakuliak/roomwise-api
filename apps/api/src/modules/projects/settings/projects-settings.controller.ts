import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { DenyDemo } from '../../auth/deny-demo.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import {
  PatchProjectsSettingsDto,
  type ProjectsSettingsAdmin,
  ProjectsSettingsAdminDto,
} from './dto/projects-settings.schema';
import { ProjectsSettingsService } from './projects-settings.service';

@Controller('admin/projects/settings')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class ProjectsSettingsController {
  constructor(private readonly settings: ProjectsSettingsService) {}

  @Get()
  @ZodResponse({ status: HttpStatus.OK, type: ProjectsSettingsAdminDto })
  async get(): Promise<ProjectsSettingsAdmin> {
    return this.settings.getAdmin();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @DenyDemo('projects-settings')
  @ZodResponse({ status: HttpStatus.OK, type: ProjectsSettingsAdminDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'STALE_REVISION',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'NOTICE_PLACEHOLDER_MISSING',
    type: ErrorResponseDto,
  })
  async update(
    @Body() body: PatchProjectsSettingsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ProjectsSettingsAdmin> {
    return this.settings.update(body, admin.id);
  }
}
