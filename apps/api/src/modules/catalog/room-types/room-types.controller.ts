import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { RoomTypeIdParamDto } from './dto/params.schema';
import { PatchRoomTypeDto } from './dto/patch-room-type.schema';
import { ReplaceRoomTypeCategoriesDto } from './dto/replace-room-type-categories.schema';
import type {
  RoomTypeAdmin,
  RoomTypeAdminListResponse,
} from './dto/room-type-admin.schema';
import {
  RoomTypeAdminDto,
  RoomTypeAdminListResponseDto,
} from './dto/room-type-admin.schema';
import { RoomTypesService } from './room-types.service';

@Controller('admin/room-types')
@ApiCookieAuth(SESSION_COOKIE_NAME)
export class RoomTypesController {
  constructor(private readonly roomTypesService: RoomTypesService) {}

  @Get()
  @ZodResponse({ status: 200, type: RoomTypeAdminListResponseDto })
  async list(): Promise<RoomTypeAdminListResponse> {
    return this.roomTypesService.list();
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: RoomTypeAdminDto })
  async updateName(
    @Param() params: RoomTypeIdParamDto,
    @Body() body: PatchRoomTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<RoomTypeAdmin> {
    return this.roomTypesService.updateName(params.id, body, admin.id);
  }

  @Put(':id/categories')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: RoomTypeAdminDto })
  async replaceCategories(
    @Param() params: RoomTypeIdParamDto,
    @Body() body: ReplaceRoomTypeCategoriesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<RoomTypeAdmin> {
    return this.roomTypesService.replaceCategories(params.id, body, admin.id);
  }
}
