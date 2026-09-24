import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
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
export class MaterialTypesController {
  constructor(private readonly materialTypesService: MaterialTypesService) {}

  @Get()
  @ZodResponse({ status: 200, type: MaterialTypeAdminListResponseDto })
  async list(): Promise<MaterialTypeAdminListResponse> {
    return this.materialTypesService.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: MaterialTypeAdminDto })
  async create(
    @Body() body: CreateMaterialTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<MaterialTypeAdmin> {
    return this.materialTypesService.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: MaterialTypeAdminDto })
  async update(
    @Param() params: MaterialTypeIdParamDto,
    @Body() body: UpdateMaterialTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<MaterialTypeAdmin> {
    return this.materialTypesService.update(params.id, body, admin.id);
  }
}
