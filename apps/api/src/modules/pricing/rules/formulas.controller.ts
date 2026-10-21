import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import {
  ValidateFormulasDto,
  type ValidateFormulasResponse,
  ValidateFormulasResponseDto,
} from './dto/validate-formulas.schema';
import { RulesService } from './rules.service';

@Controller('admin/pricing/formulas')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'UNAUTHENTICATED',
  type: ErrorResponseDto,
})
export class FormulasController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ValidateFormulasResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  async validate(
    @Body() body: ValidateFormulasDto,
  ): Promise<ValidateFormulasResponse> {
    return this.rulesService.validate(body);
  }
}
