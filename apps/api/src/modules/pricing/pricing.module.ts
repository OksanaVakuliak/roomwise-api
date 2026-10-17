import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingDatasetService } from './dataset/pricing-dataset.service';
import { PricingDataService } from './pricing-data/pricing-data.service';
import { PublicPricingController } from './public/public-pricing.controller';
import { FormulasController } from './rules/formulas.controller';
import { RulesController } from './rules/rules.controller';
import { RulesService } from './rules/rules.service';

@Module({
  imports: [CatalogModule],
  controllers: [PublicPricingController, RulesController, FormulasController],
  providers: [PricingDataService, PricingDatasetService, RulesService],
  exports: [PricingDataService, PricingDatasetService],
})
export class PricingModule {}
