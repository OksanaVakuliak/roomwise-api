import { toCents } from '../money';
import type { Configuration, EstimateLine, PricingData } from '../schemas';
import { createLine, failedLine, roundQuantity } from './line';
import { lineId } from './line-id';

export function baseLine(
  configuration: Configuration,
  data: PricingData,
): EstimateLine {
  const init = { id: lineId('BASE'), section: 'BASE' } as const;
  const area = configuration.totalAreaSqm;
  const rate = data.baseRates.find(
    (candidate) =>
      candidate.finishLevel === configuration.finishLevel &&
      candidate.areaFromSqm <= area &&
      area < candidate.areaToSqm,
  );
  if (rate === undefined) {
    return failedLine(init, 'NOT_CALCULATED', {
      code: 'BASE_RATE_NOT_FOUND',
      params: { totalAreaSqm: area, finishLevel: configuration.finishLevel },
    });
  }
  return createLine({
    ...init,
    quantity: roundQuantity(area),
    unit: 'SQM',
    unitPriceCents: rate.rateCentsPerSqm,
    amountCents: toCents((rate.rateCentsPerSqm / 100) * area),
  });
}
