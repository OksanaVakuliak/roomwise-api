import type { PricingDataset } from '../pricing-dataset.schema';
import { pricingDatasetSchema } from '../pricing-dataset.schema';
import { coefficients } from './coefficients';
import { limits } from './limits';
import { rules } from './rules';

export const pricingDataset: PricingDataset = pricingDatasetSchema.parse({
  limits,
  coefficients,
  rules,
});
