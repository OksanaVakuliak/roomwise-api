import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import { SUPPORTED_LANGUAGES } from '../../../common/i18n/resolve-lang';
import { PublicWriteLimit } from '../../../common/throttling/public-write-limit.decorator';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { Public } from '../../auth/public.decorator';
import { LangQueryDto } from '../../catalog/public/dto/lang-query.schema';
import type { IdempotencyContextValue } from '../idempotency/idempotency-request';
import {
  IdempotencyContext,
  Idempotent,
} from '../idempotency/idempotent.decorator';
import {
  CreateLeadRequestDto,
  type CreateLeadResponse,
  CreateLeadResponseDto,
  type LeadFormSettings,
  LeadFormSettingsDto,
} from './dto/create-lead.schema';
import { LeadsService } from './leads.service';

const LANG_QUERY = {
  name: 'lang',
  required: false,
  enum: SUPPORTED_LANGUAGES,
} as const;

@Controller('public/leads')
export class PublicLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @PublicWriteLimit('leads')
  @Idempotent(IdempotencyScope.LEAD)
  @Post()
  @ApiBody({ type: CreateLeadRequestDto })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreateLeadResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'CALCULATION_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'PHONE_INVALID | INPUT_OUT_OF_BOUNDS | UNKNOWN_REFERENCE | STYLE_NOT_FOUND | IDEMPOTENCY_KEY_REUSED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_REQUIRED,
    description: 'IDEMPOTENCY_KEY_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
    type: ErrorResponseDto,
  })
  create(
    @Body() body: CreateLeadRequestDto,
    @IdempotencyContext() idempotency: IdempotencyContextValue,
  ): Promise<CreateLeadResponse> {
    return this.leads.create(body, idempotency);
  }

  @Public()
  @Get('form-settings')
  @ApiQuery(LANG_QUERY)
  @ZodResponse({ status: HttpStatus.OK, type: LeadFormSettingsDto })
  formSettings(@Query() query: LangQueryDto): Promise<LeadFormSettings> {
    return this.leads.formSettings(query.lang);
  }
}
