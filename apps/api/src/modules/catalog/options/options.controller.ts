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
import { ApiCookieAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
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
  async get(@Param() params: OptionIdParamDto): Promise<OptionAdmin> {
    return this.options.get(params.id);
  }

  @Post()
  @ZodResponse({ status: HttpStatus.CREATED, type: OptionAdminDto })
  async create(
    @Body() body: CreateOptionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<OptionAdmin> {
    return this.options.create(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: HttpStatus.OK, type: OptionAdminDto })
  async update(
    @Param() params: OptionIdParamDto,
    @Body() body: PatchOptionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<OptionAdmin> {
    return this.options.update(params.id, body, admin.id);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
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
  async remove(@Param() params: OptionIdParamDto): Promise<void> {
    await this.options.remove(params.id);
  }
}
