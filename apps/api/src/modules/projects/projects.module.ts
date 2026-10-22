import { Module } from '@nestjs/common';
import { PublicWriteReplayCheck } from '../../common/throttling/public-write-replay-check';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { IdempotencyReplayCheck } from './idempotency/idempotency-replay.check';
import { ProjectsSettingsService } from './settings/projects-settings.service';

@Module({
  imports: [CatalogModule, PricingModule],
  providers: [
    IdempotencyService,
    IdempotencyInterceptor,
    IdempotencyReplayCheck,
    { provide: PublicWriteReplayCheck, useExisting: IdempotencyReplayCheck },
    ProjectsSettingsService,
  ],
  exports: [IdempotencyService, PublicWriteReplayCheck],
})
export class ProjectsModule {}
