import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { checkLimits, estimate, type PricingData } from '@roomwise/calc-engine';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import { ApiResponseHeaders } from '../../../common/openapi/api-response-headers.decorator';
import { Public } from '../../auth/public.decorator';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import {
  EstimateRequestDto,
  type EstimateResponse,
  EstimateResponseDto,
} from './dto/estimate.schema';
import { PricingDataResponseDto } from './dto/pricing-data.schema';
import { findUnknownReferences } from './find-unknown-references';

export const PRICING_DATA_CACHE_CONTROL = 'public, max-age=30';

const PRICING_DATA_HEADERS = {
  ETag: {
    description: 'Pricing version in quotes.',
    schema: { type: 'string', example: '"3f9a1c0b7d2e4a68"' },
  },
  'Cache-Control': {
    description: 'Shared caching policy for pricing data.',
    schema: { type: 'string', example: PRICING_DATA_CACHE_CONTROL },
  },
};

const ESTIMATES_PER_MINUTE = 60;
const ESTIMATES_WINDOW_MS = 60_000;

@Controller('public')
export class PublicPricingController {
  constructor(private readonly pricingData: PricingDataService) {}

  @Public()
  @Get('pricing-data')
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag value from a previous response, quotes included.',
  })
  @ApiResponseHeaders(HttpStatus.OK, PRICING_DATA_HEADERS)
  @ZodResponse({ status: HttpStatus.OK, type: PricingDataResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_MODIFIED,
    description: 'If-None-Match matches the current ETag.',
    headers: PRICING_DATA_HEADERS,
  })
  async getPricingData(
    @Res({ passthrough: true }) response: Response,
  ): Promise<PricingData> {
    const data = await this.pricingData.get();
    response.setHeader('ETag', `"${data.version}"`);
    response.setHeader('Cache-Control', PRICING_DATA_CACHE_CONTROL);
    return data;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: ESTIMATES_PER_MINUTE, ttl: ESTIMATES_WINDOW_MS },
  })
  @Post('estimates')
  @ApiBody({ type: EstimateRequestDto })
  @ZodResponse({ status: HttpStatus.OK, type: EstimateResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'INPUT_OUT_OF_BOUNDS | UNKNOWN_REFERENCE',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
    type: ErrorResponseDto,
  })
  async createEstimate(
    @Body() body: EstimateRequestDto,
  ): Promise<EstimateResponse> {
    const data = await this.pricingData.get();
    const { configuration, clientPricingVersion } = body;

    const references = findUnknownReferences(configuration, data);

    if (references.length > 0) {
      throw new AppError(ERROR_CODES.UNKNOWN_REFERENCE, {
        params: { references },
      });
    }

    const violations = checkLimits(configuration, data.limits, data.options);

    if (violations.length > 0) {
      throw new AppError(ERROR_CODES.INPUT_OUT_OF_BOUNDS, {
        params: { violations },
      });
    }

    return {
      estimate: estimate(configuration, data),
      stale:
        clientPricingVersion !== undefined &&
        clientPricingVersion !== data.version,
      pricingVersion: data.version,
    };
  }
}
