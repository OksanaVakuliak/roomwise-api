import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new PrismaService(config),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
