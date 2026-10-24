import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import { SUPPORTED_LANGUAGES } from '../../../common/i18n/resolve-lang';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { DenyDemo } from '../../auth/deny-demo.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { LangQueryDto } from '../../catalog/public/dto/lang-query.schema';
import { AdminLeadsService } from './admin-leads.service';
import {
  AddLeadNoteDto,
  ChangeLeadStatusDto,
  type LeadAdmin,
  LeadAdminDto,
  LeadIdParamDto,
  LeadListQueryDto,
  type LeadListResponse,
  LeadListResponseDto,
  type LeadNote,
  LeadNoteDto,
} from './dto/admin-lead.schema';

const LANG_QUERY = {
  name: 'lang',
  required: false,
  enum: SUPPORTED_LANGUAGES,
} as const;

@Controller('admin/leads')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class AdminLeadsController {
  constructor(private readonly leads: AdminLeadsService) {}

  @Get()
  @ZodResponse({ status: HttpStatus.OK, type: LeadListResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  list(
    @Query() query: LeadListQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<LeadListResponse> {
    return this.leads.list(query, admin);
  }

  @Get(':id')
  @ApiQuery(LANG_QUERY)
  @ZodResponse({ status: HttpStatus.OK, type: LeadAdminDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  get(
    @Param() params: LeadIdParamDto,
    @Query() query: LangQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<LeadAdmin> {
    return this.leads.get(params.id, query.lang, admin);
  }

  @Post(':id/status')
  @DenyDemo('lead-status')
  @HttpCode(HttpStatus.OK)
  @ApiQuery(LANG_QUERY)
  @ZodResponse({ status: HttpStatus.OK, type: LeadAdminDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'DEMO_FORBIDDEN',
    type: ErrorResponseDto,
  })
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
    description: 'SAME_STATUS',
    type: ErrorResponseDto,
  })
  changeStatus(
    @Param() params: LeadIdParamDto,
    @Query() query: LangQueryDto,
    @Body() body: ChangeLeadStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<LeadAdmin> {
    return this.leads.changeStatus(params.id, body, admin, query.lang);
  }

  @Post(':id/notes')
  @DenyDemo('lead-note')
  @ZodResponse({ status: HttpStatus.CREATED, type: LeadNoteDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'DEMO_FORBIDDEN',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  addNote(
    @Param() params: LeadIdParamDto,
    @Body() body: AddLeadNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<LeadNote> {
    return this.leads.addNote(params.id, body, admin);
  }

  @Delete(':id')
  @DenyDemo('lead-delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'DEMO_FORBIDDEN',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(@Param() params: LeadIdParamDto): Promise<void> {
    await this.leads.delete(params.id);
  }
}
