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
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import { OptionKind } from '../../../generated/prisma/enums';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { CatalogChangeInterceptor } from '../common/catalog-change.interceptor';
import { CreateOptionDto } from './dto/create-option.schema';
import { ListOptionsQueryDto } from './dto/list-options.schema';
import type {
  OptionAdmin,
  OptionAdminListResponse,
} from './dto/option-admin.schema';
import {
  OptionAdminDto,
  OptionAdminListResponseDto,
} from './dto/option-admin.schema';
import { OptionOrderDto } from './dto/option-order.schema';
import { UpdateOptionStatusDto } from './dto/option-status.schema';
import { OptionIdParamDto } from './dto/params.schema';
import { PatchOptionDto } from './dto/patch-option.schema';
import { OptionsService } from './options.service';

@Controller('admin/options')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
@UseInterceptors(CatalogChangeInterceptor)
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @Get()
  @ApiQuery({ name: 'kind', required: false, enum: OptionKind })
  @ZodResponse({ status: HttpStatus.OK, type: OptionAdminListResponseDto })
  async list(
    @Query() query: ListOptionsQueryDto,
  ): Promise<OptionAdminListResponse> {
    return this.options.list(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: OptionAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async get(@Param() params: OptionIdParamDto): Promise<OptionAdmin> {
    return this.options.get(params.id);
  }

  @Post()
  @ZodResponse({ status: HttpStatus.CREATED, type: OptionAdminDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'IMAGE_NOT_FOUND | QUANTITY_BOUNDS_REQUIRED | ROOM_TYPES_NOT_ALLOWED | ROOM_TYPE_NOT_FOUND | ZERO_PRICE_NOT_CONFIRMED',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: CreateOptionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<OptionAdmin> {
    return this.options.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: OptionAdminDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'STALE_REVISION',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'IMAGE_NOT_FOUND | QUANTITY_BOUNDS_REQUIRED | ROOM_TYPES_NOT_ALLOWED | ROOM_TYPE_NOT_FOUND | ZERO_PRICE_NOT_CONFIRMED',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: OptionIdParamDto,
    @Body() body: PatchOptionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<OptionAdmin> {
    return this.options.update(params.id, body, admin.id);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Reordered.' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'CONFLICT',
    type: ErrorResponseDto,
  })
  async reorder(
    @Body() body: OptionOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<void> {
    await this.options.reorder(body, admin.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: OptionAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'STALE_REVISION',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'TRANSLATION_MISSING',
    type: ErrorResponseDto,
  })
  async updateStatus(
    @Param() params: OptionIdParamDto,
    @Body() body: UpdateOptionStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<OptionAdmin> {
    return this.options.updateStatus(params.id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: OptionIdParamDto): Promise<void> {
    await this.options.remove(params.id);
  }
}
