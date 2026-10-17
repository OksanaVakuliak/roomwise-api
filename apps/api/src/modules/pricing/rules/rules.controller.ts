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
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { RulePreview } from '@roomwise/calc-engine';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { PreviewRuleDto, RulePreviewDto } from './dto/preview-rule.schema';
import type { RuleAdmin, RuleListResponse } from './dto/rule-admin.schema';
import { RuleAdminDto, RuleListResponseDto } from './dto/rule-admin.schema';
import { RuleIdParamDto } from './dto/rule-id-param.schema';
import { RuleInputDto } from './dto/rule-input.schema';
import { RuleOrderDto } from './dto/rule-order.schema';
import { UpdateRuleDto } from './dto/update-rule.schema';
import { RulesService } from './rules.service';

@Controller('admin/pricing/rules')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  @ZodResponse({ status: 200, type: RuleListResponseDto })
  async list(): Promise<RuleListResponse> {
    return this.rulesService.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: RuleAdminDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'RULE_EXISTS',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'FORMULA_INVALID, UNKNOWN_REFERENCE',
    type: ErrorResponseDto,
  })
  async create(
    @Body() body: RuleInputDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<RuleAdmin> {
    return this.rulesService.create(body, admin.id);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: RulePreviewDto })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'FORMULA_INVALID',
    type: ErrorResponseDto,
  })
  async preview(@Body() body: PreviewRuleDto): Promise<RulePreview> {
    return this.rulesService.preview(body);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Body() body: RuleOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<void> {
    await this.rulesService.reorder(body, admin.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ZodResponse({ status: 200, type: RuleAdminDto })
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
    description: 'FORMULA_INVALID',
    type: ErrorResponseDto,
  })
  async update(
    @Param() params: RuleIdParamDto,
    @Body() body: UpdateRuleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<RuleAdmin> {
    return this.rulesService.update(params.id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: RuleIdParamDto): Promise<void> {
    await this.rulesService.remove(params.id);
  }
}
