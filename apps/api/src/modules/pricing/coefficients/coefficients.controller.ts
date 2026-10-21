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
import { CoefficientsService } from './coefficients.service';
import type {
  CoefficientAdmin,
  CoefficientListResponse,
} from './dto/coefficient-admin.schema';
import {
  CoefficientAdminDto,
  CoefficientListResponseDto,
} from './dto/coefficient-admin.schema';
import { CoefficientIdParamDto } from './dto/coefficient-id-param.schema';
import { CoefficientInputDto } from './dto/coefficient-input.schema';
import { UpdateCoefficientDto } from './dto/update-coefficient.schema';

@Controller('admin/pricing/coefficients')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class CoefficientsController {
  constructor(private readonly coefficientsService: CoefficientsService) {}

  @Get()
  @ZodResponse({ status: 200, type: CoefficientListResponseDto })
  async list(): Promise<CoefficientListResponse> {
    return this.coefficientsService.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: CoefficientAdminDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'KEY_TAKEN',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: CoefficientInputDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CoefficientAdmin> {
    return this.coefficientsService.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: CoefficientAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'KEY_TAKEN, COEFFICIENT_IN_USE, STALE_REVISION',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: CoefficientIdParamDto,
    @Body() body: UpdateCoefficientDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CoefficientAdmin> {
    return this.coefficientsService.update(params.id, body, admin.id);
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
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'COEFFICIENT_IN_USE',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: CoefficientIdParamDto): Promise<void> {
    await this.coefficientsService.remove(params.id);
  }
}
