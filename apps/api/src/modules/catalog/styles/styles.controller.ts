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
import { ApiBody, ApiCookieAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { CatalogChangeInterceptor } from '../common/catalog-change.interceptor';
import { CreateStyleDto } from './dto/create-style.schema';
import { StyleIdParamDto } from './dto/params.schema';
import { PatchStyleDto } from './dto/patch-style.schema';
import type {
  StyleAdmin,
  StyleAdminListResponse,
} from './dto/style-admin.schema';
import {
  StyleAdminDto,
  StyleAdminListResponseDto,
} from './dto/style-admin.schema';
import { StyleDefaultMaterialsDto } from './dto/style-default-materials.schema';
import { StyleOrderDto } from './dto/style-order.schema';
import { UpdateStyleStatusDto } from './dto/style-status.schema';
import { StylesService } from './styles.service';

@Controller('admin/styles')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
@UseInterceptors(CatalogChangeInterceptor)
export class StylesController {
  constructor(private readonly styles: StylesService) {}

  @Get()
  @ZodResponse({ status: HttpStatus.OK, type: StyleAdminListResponseDto })
  async list(): Promise<StyleAdminListResponse> {
    return this.styles.list();
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: StyleAdminDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async get(@Param() params: StyleIdParamDto): Promise<StyleAdmin> {
    return this.styles.get(params.id);
  }

  @Post()
  @ApiBody({ type: CreateStyleDto })
  @ZodResponse({ status: HttpStatus.CREATED, type: StyleAdminDto })
  async create(
    @Body() body: CreateStyleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<StyleAdmin> {
    return this.styles.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: PatchStyleDto })
  @ZodResponse({ status: HttpStatus.OK, type: StyleAdminDto })
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
    description: 'TRANSLATION_MISSING | STYLE_IMAGE_MISSING',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: StyleIdParamDto,
    @Body() body: PatchStyleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<StyleAdmin> {
    return this.styles.update(params.id, body, admin.id);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: StyleOrderDto })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'STYLE_SET_MISMATCH',
    type: ErrorResponseDto,
  })
  async reorder(
    @Body() body: StyleOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<void> {
    await this.styles.reorder(body, admin.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateStyleStatusDto })
  @ZodResponse({ status: HttpStatus.OK, type: StyleAdminDto })
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
    description: 'TRANSLATION_MISSING | STYLE_IMAGE_MISSING',
    type: ErrorResponseDto,
  })
  async updateStatus(
    @Param() params: StyleIdParamDto,
    @Body() body: UpdateStyleStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<StyleAdmin> {
    return this.styles.updateStatus(params.id, body, admin.id);
  }

  @Put(':id/default-materials')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: StyleDefaultMaterialsDto })
  @ZodResponse({ status: HttpStatus.OK, type: StyleAdminDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'STALE_REVISION',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'PAIR_NOT_IN_ROOM_TYPE | PRODUCT_CATEGORY_MISMATCH | PRODUCT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async updateDefaultMaterials(
    @Param() params: StyleIdParamDto,
    @Body() body: StyleDefaultMaterialsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<StyleAdmin> {
    return this.styles.updateDefaultMaterials(params.id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: StyleIdParamDto): Promise<void> {
    await this.styles.remove(params.id);
  }
}
