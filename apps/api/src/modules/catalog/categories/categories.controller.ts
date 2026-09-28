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
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import { PublicationStatus } from '../../../generated/prisma/enums';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
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
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
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
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: CreateCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CategoryAdmin> {
    return this.categories.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: CategoryAdminDto })
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
    description: 'SURFACE_DATA_MISSING',
    type: ErrorResponseDto,
  })
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
    @Param() params: CategoryIdParamDto,
    @Body() body: UpdateCategoryStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CategoryAdmin> {
    return this.categories.updateStatus(params.id, body, admin.id);
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
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'CATEGORY_IN_USE',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: CategoryIdParamDto): Promise<void> {
    await this.categories.remove(params.id);
  }
}
