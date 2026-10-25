import { Module } from '@nestjs/common';
import { PublicWriteExemption } from '../../common/throttling/public-write-exemption';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { CalculationsService } from './calculations/calculations.service';
import { PriceStatusService } from './calculations/price-status.service';
import { PublicCalculationsController } from './calculations/public-calculations.controller';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { IdempotencyThrottleExemption } from './idempotency/idempotency-throttle-exemption';
import { AdminLeadsController } from './leads/admin-leads.controller';
import { AdminLeadsService } from './leads/admin-leads.service';
import { LeadsService } from './leads/leads.service';
import { PublicLeadsController } from './leads/public-leads.controller';
import {
  IdempotencyKeysCleanupTask,
  LeadRetentionTask,
} from './maintenance/lead-retention.task';
import { VersionViewPresenter } from './presenters/version-view.presenter';
import { ProjectsSettingsController } from './settings/projects-settings.controller';
import { ProjectsSettingsService } from './settings/projects-settings.service';
import { SnapshotBuilder } from './snapshot/snapshot.builder';

@Module({
  controllers: [
    PublicCalculationsController,
    PublicLeadsController,
    ProjectsSettingsController,
    AdminLeadsController,
  ],
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
    PriceStatusService,
    VersionViewPresenter,
    CalculationsService,
    LeadsService,
    AdminLeadsService,
    LeadRetentionTask,
    IdempotencyKeysCleanupTask,
  ],
  exports: [IdempotencyService, PublicWriteExemption],
})
export class ProjectsModule {}
