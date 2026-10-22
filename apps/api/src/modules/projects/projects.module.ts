import { Module } from '@nestjs/common';
import { PublicWriteExemption } from '../../common/throttling/public-write-exemption';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { CalculationsService } from './calculations/calculations.service';
import { PublicCalculationsController } from './calculations/public-calculations.controller';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { IdempotencyThrottleExemption } from './idempotency/idempotency-throttle-exemption';
import { VersionViewPresenter } from './presenters/version-view.presenter';
import { ProjectsSettingsService } from './settings/projects-settings.service';
import { SnapshotBuilder } from './snapshot/snapshot.builder';

@Module({
  controllers: [PublicCalculationsController],
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
    SnapshotBuilder,
    VersionViewPresenter,
    CalculationsService,
  ],
  exports: [IdempotencyService, PublicWriteExemption],
})
export class ProjectsModule {}
