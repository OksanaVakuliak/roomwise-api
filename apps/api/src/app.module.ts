import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { HttpExceptionFilter } from './common/http/http-exception.filter';
import { MaintenanceModule } from './common/maintenance/maintenance.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { validateEnv } from './config/env';
import { pinoHttpOptions } from './config/logger';
import { AdminAuthGuard } from './modules/auth/admin-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

const RATE_LIMIT_TTL_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: pinoHttpOptions,
    }),
    PrismaModule,
    SentryModule.forRoot(),
    ThrottlerModule.forRoot([
      { ttl: RATE_LIMIT_TTL_MS, limit: RATE_LIMIT_MAX_REQUESTS },
    ]),
    HealthModule,
    MaintenanceModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AdminAuthGuard,
    },
  ],
})
export class AppModule {}
