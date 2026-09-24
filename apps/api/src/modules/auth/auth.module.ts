import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfigService } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DenyDemoGuard } from './deny-demo.guard';
import { SessionService } from './session.service';
import { SessionCookieService } from './session-cookie';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionCookieService, DenyDemoGuard],
  exports: [SessionService, SessionCookieService],
})
export class AuthModule {}
