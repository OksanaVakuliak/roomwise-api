import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CatalogModule } from '../catalog/catalog.module';
import { SandboxService } from './sandbox.service';
import { SandboxCatchUpInterceptor } from './sandbox-catch-up.interceptor';
import { sandboxDatasetParticipantsProvider } from './sandbox-dataset-participant';
import { SandboxSchedule } from './sandbox-schedule';

@Module({
  imports: [CatalogModule],
  providers: [
    sandboxDatasetParticipantsProvider,
    SandboxService,
    SandboxSchedule,
    {
      provide: APP_INTERCEPTOR,
      useClass: SandboxCatchUpInterceptor,
    },
  ],
  exports: [SandboxService],
})
export class SandboxModule {}
