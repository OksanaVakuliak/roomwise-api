import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CoefficientsController } from './coefficients/coefficients.controller';
import { CoefficientsService } from './coefficients/coefficients.service';
import { PricingDatasetService } from './dataset/pricing-dataset.service';
import { PricingEstimateService } from './estimate/pricing-estimate.service';
import { ExchangeRateController } from './exchange-rate/exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate/exchange-rate.service';
import { ExchangeRateRefreshTask } from './exchange-rate/exchange-rate.task';
import { NbuClient } from './exchange-rate/nbu.client';
import { PricingDataService } from './pricing-data/pricing-data.service';
import { PublicPricingController } from './public/public-pricing.controller';
import { FormulasController } from './rules/formulas.controller';
import { RulesController } from './rules/rules.controller';
import { RulesService } from './rules/rules.service';

@Module({
  imports: [CatalogModule],
  controllers: [
    PublicPricingController,
    RulesController,
    FormulasController,
    CoefficientsController,
    ExchangeRateController,
  ],
  providers: [
    PricingDataService,
    PricingDatasetService,
    PricingEstimateService,
    RulesService,
    CoefficientsService,
    NbuClient,
    ExchangeRateService,
    ExchangeRateRefreshTask,
  ],
  exports: [
    PricingDataService,
    PricingDatasetService,
    PricingEstimateService,
    ExchangeRateService,
  ],
})
export class PricingModule {}
