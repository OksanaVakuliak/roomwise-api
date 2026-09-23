import './instrument';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupOpenApi } from './common/openapi/openapi';
import type { AppConfigService } from './config/env';
import { EnvValidationError } from './config/env';

export function configureApplication(
  app: NestExpressApplication,
  config: AppConfigService,
): void {
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });
}

export async function createApplication(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<AppConfigService>(ConfigService);

  app.useLogger(app.get(Logger));
  app.flushLogs();

  configureApplication(app, config);

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get<AppConfigService>(ConfigService);

  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupOpenApi(app);
  }

  await app.listen(config.get('PORT', { infer: true }));
}

const SENTRY_FLUSH_TIMEOUT_MS = 2000;

if (require.main === module) {
  bootstrap().catch(async (error) => {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
      return;
    }

    Sentry.captureException(error);
    await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);

    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);

    process.stderr.write(`Application failed to start.\n${details}\n`);
    process.exit(1);
  });
}
