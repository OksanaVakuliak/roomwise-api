import { Inject, Injectable } from '@nestjs/common';
import {
  type Configuration,
  checkLimits,
  type Estimate,
  estimate,
  type OptionKind,
  type PricingData,
  type PricingOption,
} from '@roomwise/calc-engine';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PricingDataService } from '../pricing-data/pricing-data.service';
import {
  findUnknownReferences,
  type MissingReferencesPolicy,
} from './find-unknown-references';

export interface RetiredOption {
  id: string;
  kind: OptionKind;
}

export interface EstimateOptions {
  missingReferences?: MissingReferencesPolicy;
  retiredOptions?: readonly RetiredOption[];
}

function withRetiredOptions(
  configuration: Configuration,
  data: PricingData,
  retired: readonly RetiredOption[],
): PricingData {
  const known = new Set(data.options.map((option) => option.id));
  const placeholders = new Map<string, PricingOption>();

  for (const { optionId } of configuration.options) {
    const entry = retired.find((item) => item.id === optionId);

    if (entry !== undefined && !known.has(optionId)) {
      placeholders.set(optionId, {
        id: entry.id,
        code: null,
        kind: entry.kind,
        priceCents: 0,
        unit: 'PROJECT',
        roomTypeCodes: [],
        minQuantity: null,
        maxQuantity: null,
        available: false,
      });
    }
  }

  return placeholders.size === 0
    ? data
    : { ...data, options: [...data.options, ...placeholders.values()] };
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
    const catalogData = await this.pricingData.get();
    const data =
      options.missingReferences === 'unavailable' && options.retiredOptions
        ? withRetiredOptions(configuration, catalogData, options.retiredOptions)
        : catalogData;

    const references = findUnknownReferences(
      configuration,
      data,
      options.missingReferences,
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

    return {
      estimate: estimate(configuration, data),
      pricingData: catalogData,
    };
  }
}
