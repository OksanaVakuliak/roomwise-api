import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { SUPPORTED_LANGUAGES } from '../../../common/i18n/resolve-lang';
import { Public } from '../../auth/public.decorator';
import { CATALOG_CACHE_CONTROL_HEADER, CatalogCache } from './catalog-cache';
import type { PublicDefaultMaterialsResponse } from './dto/default-materials.schema';
import { PublicDefaultMaterialsResponseDto } from './dto/default-materials.schema';
import type { PublicEngineeringResponse } from './dto/engineering.schema';
import { PublicEngineeringResponseDto } from './dto/engineering.schema';
import { LangQueryDto } from './dto/lang-query.schema';
import {
  CategoryIdParamDto,
  ProductIdParamDto,
  StyleIdParamDto,
} from './dto/params.schema';
import type { PublicProductCardsResponse } from './dto/product-card.schema';
import { PublicProductCardsResponseDto } from './dto/product-card.schema';
import type { PublicProductDetails } from './dto/product-details.schema';
import { PublicProductDetailsResponseDto } from './dto/product-details.schema';
import type { PublicRoomTypesResponse } from './dto/room-type.schema';
import { PublicRoomTypesResponseDto } from './dto/room-type.schema';
import type { PublicStylesResponse } from './dto/style.schema';
import { PublicStylesResponseDto } from './dto/style.schema';
import { PublicCatalogService } from './public-catalog.service';

@Controller('public')
export class PublicCatalogController {
  constructor(
    private readonly catalog: PublicCatalogService,
    private readonly cache: CatalogCache,
  ) {}

  @Public()
  @Get('styles')
  @ApiQuery({ name: 'lang', required: false, enum: SUPPORTED_LANGUAGES })
  @ZodResponse({ status: 200, type: PublicStylesResponseDto })
  async listStyles(
    @Query() query: LangQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicStylesResponse> {
    const result = await this.cache.getOrLoad(`styles:${query.lang}`, () =>
      this.catalog.listStyles(query.lang),
    );
    response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL_HEADER);
    return result;
  }

  @Public()
  @Get('room-types')
  @ApiQuery({ name: 'lang', required: false, enum: SUPPORTED_LANGUAGES })
  @ZodResponse({ status: 200, type: PublicRoomTypesResponseDto })
  async listRoomTypes(
    @Query() query: LangQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicRoomTypesResponse> {
    const result = await this.cache.getOrLoad(`room-types:${query.lang}`, () =>
      this.catalog.listRoomTypes(query.lang),
    );
    response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL_HEADER);
    return result;
  }

  @Public()
  @Get('categories/:categoryId/products')
  @ApiParam({ name: 'categoryId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'lang', required: false, enum: SUPPORTED_LANGUAGES })
  @ZodResponse({ status: 200, type: PublicProductCardsResponseDto })
  async listCategoryProducts(
    @Param() params: CategoryIdParamDto,
    @Query() query: LangQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicProductCardsResponse> {
    const result = await this.cache.getOrLoad(
      `category-products:${params.categoryId}:${query.lang}`,
      () => this.catalog.listCategoryProducts(params.categoryId, query.lang),
    );
    response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL_HEADER);
    return result;
  }

  @Public()
  @Get('products/:productId')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'lang', required: false, enum: SUPPORTED_LANGUAGES })
  @ZodResponse({ status: 200, type: PublicProductDetailsResponseDto })
  async getProduct(
    @Param() params: ProductIdParamDto,
    @Query() query: LangQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicProductDetails> {
    const result = await this.cache.getOrLoad(
      `product:${params.productId}:${query.lang}`,
      () => this.catalog.getProduct(params.productId, query.lang),
    );
    response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL_HEADER);
    return result;
  }

  @Public()
  @Get('styles/:styleId/default-materials')
  @ApiParam({ name: 'styleId', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: PublicDefaultMaterialsResponseDto })
  async getStyleDefaultMaterials(
    @Param() params: StyleIdParamDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicDefaultMaterialsResponse> {
    const result = await this.cache.getOrLoad(
      `default-materials:${params.styleId}`,
      () => this.catalog.getStyleDefaultMaterials(params.styleId),
    );
    response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL_HEADER);
    return result;
  }

  @Public()
  @Get('engineering')
  @ApiQuery({ name: 'lang', required: false, enum: SUPPORTED_LANGUAGES })
  @ZodResponse({ status: 200, type: PublicEngineeringResponseDto })
  async getEngineering(
    @Query() query: LangQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicEngineeringResponse> {
    const result = await this.cache.getOrLoad(`engineering:${query.lang}`, () =>
      this.catalog.getEngineering(query.lang),
    );
    response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL_HEADER);
    return result;
  }
}
