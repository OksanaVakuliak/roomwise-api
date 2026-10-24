import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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
  type VersionView,
  VersionViewDto,
} from '../presenters/version-view.schema';
import { CalculationsService } from './calculations.service';
import {
  SaveCalculationRequestDto,
  type SaveCalculationResponse,
  SaveCalculationResponseDto,
} from './dto/save-calculation.schema';

const LANG_QUERY = {
  name: 'lang',
  required: false,
  enum: SUPPORTED_LANGUAGES,
} as const;

const VERSION_NUMBER_PATTERN = /^[1-9]\d{0,8}$/;
const NO_SUCH_VERSION = 0;

function parseVersionNumber(value: string): number {
  return VERSION_NUMBER_PATTERN.test(value) ? Number(value) : NO_SUCH_VERSION;
}

@Controller('public/calculations')
export class PublicCalculationsController {
  constructor(private readonly calculations: CalculationsService) {}

  @Public()
  @PublicWriteLimit('saves')
  @Idempotent(IdempotencyScope.SAVE)
  @Post()
  @ApiQuery(LANG_QUERY)
  @ApiBody({ type: SaveCalculationRequestDto })
  @ZodResponse({ status: HttpStatus.CREATED, type: SaveCalculationResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'INPUT_OUT_OF_BOUNDS | UNKNOWN_REFERENCE | STYLE_NOT_FOUND | IDEMPOTENCY_KEY_REUSED',
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
    @Body() body: SaveCalculationRequestDto,
    @Query() query: LangQueryDto,
    @IdempotencyContext() idempotency: IdempotencyContextValue,
  ): Promise<SaveCalculationResponse> {
    return this.calculations.create(body, idempotency, query.lang);
  }

  @Public()
  @Get(':publicId')
  @ApiQuery(LANG_QUERY)
  @ZodResponse({ status: HttpStatus.OK, type: VersionViewDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'CALCULATION_NOT_FOUND',
    type: ErrorResponseDto,
  })
  getLatest(
    @Param('publicId') publicId: string,
    @Query() query: LangQueryDto,
  ): Promise<VersionView> {
    return this.calculations.findVersion(publicId, null, query.lang);
  }

  @Public()
  @Get(':publicId/versions/:number')
  @ApiQuery(LANG_QUERY)
  @ZodResponse({ status: HttpStatus.OK, type: VersionViewDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'CALCULATION_NOT_FOUND',
    type: ErrorResponseDto,
  })
  getVersion(
    @Param('publicId') publicId: string,
    @Param('number') number: string,
    @Query() query: LangQueryDto,
  ): Promise<VersionView> {
    return this.calculations.findVersion(
      publicId,
      parseVersionNumber(number),
      query.lang,
    );
  }
}
