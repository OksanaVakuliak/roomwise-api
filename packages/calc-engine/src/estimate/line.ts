import { toCents } from '../money';
import type { EstimateLine, EstimateMessage } from '../schemas';

export const MAX_LINE_CENTS = 10_000_000_000;

type LineInit = Pick<EstimateLine, 'id' | 'section'> & Partial<EstimateLine>;

export function createLine(init: LineInit): EstimateLine {
  return {
    status: 'OK',
    roomClientId: null,
    categoryId: null,
    productId: null,
    optionId: null,
    packageItemId: null,
    ruleId: null,
    quantity: null,
    unit: null,
    unitPriceCents: null,
    amountCents: 0,
    amountUahKopecks: null,
    warnings: [],
    error: null,
    ...init,
  };
}

export function failedLine(
  init: LineInit,
  status: 'NOT_CALCULATED' | 'UNAVAILABLE' | 'ERROR',
  error: EstimateMessage,
): EstimateLine {
  return createLine({ ...init, status, error });
}

export function pricedLine(init: LineInit, dollars: number): EstimateLine {
  if (
    !Number.isFinite(dollars) ||
    dollars < 0 ||
    dollars * 100 > MAX_LINE_CENTS
  ) {
    return failedLine(init, 'ERROR', {
      code: 'AMOUNT_OUT_OF_RANGE',
      params: { maxCents: MAX_LINE_CENTS },
    });
  }
  return createLine({ ...init, amountCents: toCents(dollars) });
}

export function roundQuantity(quantity: number): number {
  return Math.round(quantity * 1000) / 1000;
}
