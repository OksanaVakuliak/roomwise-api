import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingDatasetService } from './dataset/pricing-dataset.service';
import { PricingDataService } from './pricing-data/pricing-data.service';
import { PublicPricingController } from './public/public-pricing.controller';

@Module({
  imports: [CatalogModule],
  controllers: [PublicPricingController],
  providers: [PricingDataService, PricingDatasetService],
  exports: [PricingDataService, PricingDatasetService],
})
export class PricingModule {}
