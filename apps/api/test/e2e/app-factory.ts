import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { AppConfigService } from '../../src/config/env';
import { configureApplication } from '../../src/main';

export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

export interface CreateTestAppOptions {
  overrides?: ProviderOverride[];
}

export interface TestApp {
  app: NestExpressApplication;
  http: ReturnType<NestExpressApplication['getHttpServer']>;
  prisma: PrismaService;
  close: () => Promise<void>;
}

export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<TestApp> {
  const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });

  for (const override of options.overrides ?? []) {
    moduleBuilder
      .overrideProvider(override.provide)
      .useValue(override.useValue);
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  const config = app.get<AppConfigService>(ConfigService);

  configureApplication(app, config);
  await app.init();

  return {
    app,
    http: app.getHttpServer(),
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}
