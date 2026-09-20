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

export async function createApplication(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<AppConfigService>(ConfigService);

  app.useLogger(app.get(Logger));
  app.flushLogs();

  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get<AppConfigService>(ConfigService);

  setupOpenApi(app);

  await app.listen(config.get('PORT', { infer: true }));
}

if (require.main === module) {
  bootstrap().catch((error) => {
    const message =
      error instanceof EnvValidationError
        ? error.message
        : 'Application failed to start.';

    if (!(error instanceof EnvValidationError)) {
      Sentry.captureException(error);
    }

    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
