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
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiParam, ApiQuery } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { PublicationStatus } from '../../../generated/prisma/enums';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { CatalogChangeInterceptor } from '../common/catalog-change.interceptor';
import { CategoriesService } from './categories.service';
import type {
  CategoryAdmin,
  CategoryAdminListResponse,
} from './dto/category-admin.schema';
import {
  CategoryAdminDto,
  CategoryAdminListResponseDto,
} from './dto/category-admin.schema';
import { UpdateCategoryStatusDto } from './dto/category-status.schema';
import { CreateCategoryDto } from './dto/create-category.schema';
import { ListCategoriesQueryDto } from './dto/list-categories.schema';
import { CategoryIdParamDto } from './dto/params.schema';
import { PatchCategoryDto } from './dto/patch-category.schema';

@Controller('admin/categories')
@UseInterceptors(CatalogChangeInterceptor)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: PublicationStatus })
  @ZodResponse({ status: HttpStatus.OK, type: CategoryAdminListResponseDto })
  async list(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryAdminListResponse> {
    return this.categories.list(query);
  }

  @Post()
  @ZodResponse({ status: HttpStatus.CREATED, type: CategoryAdminDto })
  async create(
    @Body() body: CreateCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CategoryAdmin> {
    return this.categories.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: CategoryAdminDto })
  async update(
    @Param() params: CategoryIdParamDto,
    @Body() body: PatchCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CategoryAdmin> {
    return this.categories.update(params.id, body, admin.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: CategoryAdminDto })
  async updateStatus(
    @Param() params: CategoryIdParamDto,
    @Body() body: UpdateCategoryStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CategoryAdmin> {
    return this.categories.updateStatus(params.id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async remove(@Param() params: CategoryIdParamDto): Promise<void> {
    await this.categories.remove(params.id);
  }
}
