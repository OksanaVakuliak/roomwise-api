import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import {
  type ExchangeRateStatus,
  ExchangeRateStatusDto,
  ManualRateInputDto,
} from './dto/exchange-rate.schema';
import { ExchangeRateService } from './exchange-rate.service';

@Controller('admin/pricing/exchange-rate')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class ExchangeRateController {
  constructor(private readonly exchangeRates: ExchangeRateService) {}

  @Get()
  @ZodResponse({ status: 200, type: ExchangeRateStatusDto })
  async get(): Promise<ExchangeRateStatus> {
    return this.exchangeRates.status();
  }

  @Put('manual')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ExchangeRateStatusDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  async setManual(
    @Body() body: ManualRateInputDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ExchangeRateStatus> {
    return this.exchangeRates.setManual(body.rate, admin.id);
  }

  @Delete('manual')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ExchangeRateStatusDto })
  async clearManual(): Promise<ExchangeRateStatus> {
    return this.exchangeRates.clearManual();
  }
}
