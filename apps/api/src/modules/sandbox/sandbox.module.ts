import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { SandboxService } from './sandbox.service';
import { SandboxCatchUpInterceptor } from './sandbox-catch-up.interceptor';
import { sandboxDatasetParticipantsProvider } from './sandbox-dataset-participant';
import { SandboxSchedule } from './sandbox-schedule';

@Module({
  imports: [CatalogModule, PricingModule],
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
