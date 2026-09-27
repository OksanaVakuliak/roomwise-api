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
  UseInterceptors,
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { CatalogChangeInterceptor } from '../common/catalog-change.interceptor';
import { CreateEngineeringPackageItemDto } from './dto/create-engineering-package-item.schema';
import type {
  EngineeringPackageItemAdmin,
  EngineeringPackageItemAdminListResponse,
} from './dto/engineering-package-item-admin.schema';
import {
  EngineeringPackageItemAdminDto,
  EngineeringPackageItemAdminListResponseDto,
} from './dto/engineering-package-item-admin.schema';
import { EngineeringPackageItemOrderDto } from './dto/engineering-package-item-order.schema';
import { UpdateEngineeringPackageItemStatusDto } from './dto/engineering-package-item-status.schema';
import { EngineeringPackageItemIdParamDto } from './dto/params.schema';
import { PatchEngineeringPackageItemDto } from './dto/patch-engineering-package-item.schema';
import { EngineeringPackageItemsService } from './engineering.service';

@Controller('admin/engineering/package-items')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
@UseInterceptors(CatalogChangeInterceptor)
export class EngineeringPackageItemsController {
  constructor(private readonly items: EngineeringPackageItemsService) {}

  @Get()
  @ZodResponse({
    status: HttpStatus.OK,
    type: EngineeringPackageItemAdminListResponseDto,
  })
  async list(): Promise<EngineeringPackageItemAdminListResponse> {
    return this.items.list();
  }

  @Post()
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: EngineeringPackageItemAdminDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'PRICE_REQUIRED',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: CreateEngineeringPackageItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<EngineeringPackageItemAdmin> {
    return this.items.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: EngineeringPackageItemAdminDto,
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
    description: 'PRICE_REQUIRED',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: EngineeringPackageItemIdParamDto,
    @Body() body: PatchEngineeringPackageItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<EngineeringPackageItemAdmin> {
    return this.items.update(params.id, body, admin.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: EngineeringPackageItemAdminDto,
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
    description: 'TRANSLATION_MISSING',
    type: ErrorResponseDto,
  })
  async updateStatus(
    @Param() params: EngineeringPackageItemIdParamDto,
    @Body() body: UpdateEngineeringPackageItemStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<EngineeringPackageItemAdmin> {
    return this.items.updateStatus(params.id, body, admin.id);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
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
    @Body() body: EngineeringPackageItemOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<void> {
    await this.items.reorder(body, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(
    @Param() params: EngineeringPackageItemIdParamDto,
  ): Promise<void> {
    await this.items.remove(params.id);
  }
}
