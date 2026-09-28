import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { CreateMaterialTypeDto } from './dto/create-material-type.schema';
import type {
  MaterialTypeAdmin,
  MaterialTypeAdminListResponse,
} from './dto/material-type-admin.schema';
import {
  MaterialTypeAdminDto,
  MaterialTypeAdminListResponseDto,
} from './dto/material-type-admin.schema';
import { MaterialTypeIdParamDto } from './dto/params.schema';
import { UpdateMaterialTypeDto } from './dto/update-material-type.schema';
import { MaterialTypesService } from './material-types.service';

@Controller('admin/material-types')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
@UseInterceptors(CatalogChangeInterceptor)
export class MaterialTypesController {
  constructor(private readonly materialTypesService: MaterialTypesService) {}

  @Get()
  @ZodResponse({ status: 200, type: MaterialTypeAdminListResponseDto })
  async list(): Promise<MaterialTypeAdminListResponse> {
    return this.materialTypesService.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: MaterialTypeAdminDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'CODE_TAKEN',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: CreateMaterialTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<MaterialTypeAdmin> {
    return this.materialTypesService.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: MaterialTypeAdminDto })
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
  async update(
    @Param() params: MaterialTypeIdParamDto,
    @Body() body: UpdateMaterialTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<MaterialTypeAdmin> {
    return this.materialTypesService.update(params.id, body, admin.id);
  }
}
