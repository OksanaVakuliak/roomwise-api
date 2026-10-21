import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { BaseRatesService } from './base-rates.service';
import type {
  BaseRateAdmin,
  BaseRateListResponse,
} from './dto/base-rate-admin.schema';
import {
  BaseRateAdminDto,
  BaseRateListResponseDto,
} from './dto/base-rate-admin.schema';
import { BaseRateIdParamDto } from './dto/base-rate-id-param.schema';
import { BaseRateInputDto } from './dto/base-rate-input.schema';
import { UpdateBaseRateDto } from './dto/update-base-rate.schema';

@Controller('admin/pricing/base-rates')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class BaseRatesController {
  constructor(private readonly baseRatesService: BaseRatesService) {}

  @Get()
  @ZodResponse({ status: 200, type: BaseRateListResponseDto })
  async list(): Promise<BaseRateListResponse> {
    return this.baseRatesService.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: BaseRateAdminDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'RANGE_OVERLAP',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: BaseRateInputDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<BaseRateAdmin> {
    return this.baseRatesService.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: BaseRateAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'RANGE_OVERLAP, STALE_REVISION',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: BaseRateIdParamDto,
    @Body() body: UpdateBaseRateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<BaseRateAdmin> {
    return this.baseRatesService.update(params.id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: BaseRateIdParamDto): Promise<void> {
    await this.baseRatesService.remove(params.id);
  }
}
