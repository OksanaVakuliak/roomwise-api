import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import {
  type AdminMe,
  AdminMeDto,
  ChangePasswordDto,
  LoginDto,
} from './auth.schemas';
import { AuthService, toAdminMe } from './auth.service';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from './current-admin.decorator';
import { DenyDemo } from './deny-demo.decorator';
import { Public } from './public.decorator';
import { SessionService } from './session.service';
import { SESSION_COOKIE_NAME, SessionCookieService } from './session-cookie';

const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 900_000;

@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: LOGIN_RATE_LIMIT, ttl: LOGIN_RATE_LIMIT_WINDOW_MS },
  })
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ZodResponse({ status: HttpStatus.OK, type: AdminMeDto })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminMe> {
    const result = await this.authService.login(body.login, body.password);
    await this.sessionCookieService.issue(response, result.sessionId);

    return result.admin;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessionService.delete(admin.sessionId);
    this.sessionCookieService.clear(response);
  }

  @Get('me')
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ZodResponse({ status: HttpStatus.OK, type: AdminMeDto })
  me(@CurrentAdmin() admin: AuthenticatedAdmin): AdminMe {
    return toAdminMe(admin);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @DenyDemo('change-password')
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      admin.id,
      admin.sessionId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
