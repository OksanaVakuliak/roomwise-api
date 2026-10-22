import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({ imports: [CatalogModule, PricingModule] })
export class ProjectsModule {}
