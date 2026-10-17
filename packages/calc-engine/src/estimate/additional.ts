import type { Configuration, EstimateLine, PricingData } from '../schemas';
import { optionLines } from './option-line';

export function additionalLines(
  configuration: Configuration,
  data: PricingData,
): EstimateLine[] {
  return optionLines(configuration, data, 'ADDITIONAL');
}
