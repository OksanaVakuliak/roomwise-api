import { Module } from '@nestjs/common';
import { PublicWriteExemption } from '../../common/throttling/public-write-exemption';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { IdempotencyThrottleExemption } from './idempotency/idempotency-throttle-exemption';
import { ProjectsSettingsService } from './settings/projects-settings.service';

@Module({
  imports: [CatalogModule, PricingModule],
  providers: [
    IdempotencyService,
    IdempotencyInterceptor,
    IdempotencyThrottleExemption,
    {
      provide: PublicWriteExemption,
      useExisting: IdempotencyThrottleExemption,
    },
    ProjectsSettingsService,
  ],
  exports: [IdempotencyService, PublicWriteExemption],
})
export class ProjectsModule {}
