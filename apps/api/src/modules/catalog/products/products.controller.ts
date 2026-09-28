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
import { CreateProductDto } from './dto/create-product.schema';
import { ListProductsQueryDto } from './dto/list-products.schema';
import { ProductIdParamDto } from './dto/params.schema';
import { PatchProductDto } from './dto/patch-product.schema';
import type { ProductAdmin } from './dto/product-admin.schema';
import { ProductAdminDto } from './dto/product-admin.schema';
import type { ProductAdminListResponse } from './dto/product-admin-list-item.schema';
import { ProductAdminListResponseDto } from './dto/product-admin-list-item.schema';
import type { ProductStatusResponse } from './dto/product-status.schema';
import {
  ProductStatusResponseDto,
  UpdateProductStatusDto,
} from './dto/product-status.schema';
import { ProductsService } from './products.service';

@Controller('admin/products')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
@UseInterceptors(CatalogChangeInterceptor)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: PublicationStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ZodResponse({ status: HttpStatus.OK, type: ProductAdminListResponseDto })
  async list(
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductAdminListResponse> {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: ProductAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async get(@Param() params: ProductIdParamDto): Promise<ProductAdmin> {
    return this.products.get(params.id);
  }

  @Post()
  @ZodResponse({ status: HttpStatus.CREATED, type: ProductAdminDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'CATEGORY_NOT_FOUND | MATERIAL_TYPE_NOT_FOUND | IMAGE_NOT_FOUND | ZERO_PRICE_NOT_CONFIRMED',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: CreateProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ProductAdmin> {
    return this.products.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: ProductAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'STALE_REVISION | PRODUCT_IN_USE',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'CATEGORY_NOT_FOUND | MATERIAL_TYPE_NOT_FOUND | IMAGE_NOT_FOUND | ZERO_PRICE_NOT_CONFIRMED | SURFACE_DATA_MISSING | PRIMARY_IMAGE_MISSING',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: ProductIdParamDto,
    @Body() body: PatchProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ProductAdmin> {
    return this.products.update(params.id, body, admin.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: ProductStatusResponseDto })
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
      'TRANSLATION_MISSING | SURFACE_DATA_MISSING | PRIMARY_IMAGE_MISSING',
    type: ErrorResponseDto,
  })
  async changeStatus(
    @Param() params: ProductIdParamDto,
    @Body() body: UpdateProductStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ProductStatusResponse> {
    return this.products.changeStatus(params.id, body, admin.id);
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
    description: 'PRODUCT_IN_USE',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: ProductIdParamDto): Promise<void> {
    await this.products.remove(params.id);
  }
}
