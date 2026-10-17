import type { SeedPricingLimits } from '../pricing-dataset.schema';

export const limits: SeedPricingLimits = {
  totalAreaSqm: { min: 15, max: 500 },
  rooms: { min: 1, max: 15 },
  roomSideM: { min: 1, max: 30 },
  roomHeightM: { min: 2.2, max: 5 },
};
