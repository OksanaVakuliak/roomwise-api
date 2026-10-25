import { Inject, Injectable } from '@nestjs/common';
import {
  type Configuration,
  checkLimits,
  type Estimate,
  estimate,
  type PricingData,
} from '@roomwise/calc-engine';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import {
  findUnknownReferences,
  type MissingProductsPolicy,
} from './find-unknown-references';

export interface EstimateOptions {
  missingProducts?: MissingProductsPolicy;
}

@Injectable()
export class PricingEstimateService {
  constructor(
    @Inject(PricingDataService)
    private readonly pricingData: PricingDataService,
  ) {}

  async estimate(
    configuration: Configuration,
    options: EstimateOptions = {},
  ): Promise<{ estimate: Estimate; pricingData: PricingData }> {
    const data = await this.pricingData.get();

    const references = findUnknownReferences(
      configuration,
      data,
      options.missingProducts,
    );

    if (references.length > 0) {
      throw new AppError(ERROR_CODES.UNKNOWN_REFERENCE, {
        params: { references },
      });
    }

    const violations = checkLimits(configuration, data.limits, data.options);

    if (violations.length > 0) {
      throw new AppError(ERROR_CODES.INPUT_OUT_OF_BOUNDS, {
        params: { violations },
      });
    }

    return { estimate: estimate(configuration, data), pricingData: data };
  }
}
