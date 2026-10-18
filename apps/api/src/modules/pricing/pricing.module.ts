import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { BaseRatesController } from './base-rates/base-rates.controller';
import { BaseRatesService } from './base-rates/base-rates.service';
import { CoefficientsController } from './coefficients/coefficients.controller';
import { CoefficientsService } from './coefficients/coefficients.service';
import { PricingDatasetService } from './dataset/pricing-dataset.service';
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
    BaseRatesController,
    CoefficientsController,
    ExchangeRateController,
  ],
  providers: [
    PricingDataService,
    PricingDatasetService,
    RulesService,
    BaseRatesService,
    CoefficientsService,
    NbuClient,
    ExchangeRateService,
    ExchangeRateRefreshTask,
  ],
  exports: [PricingDataService, PricingDatasetService, ExchangeRateService],
})
export class PricingModule {}
