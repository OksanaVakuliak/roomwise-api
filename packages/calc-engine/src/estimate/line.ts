import type { EstimateLine, EstimateMessage } from '../schemas';

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

export function roundQuantity(quantity: number): number {
  return Math.round(quantity * 1000) / 1000;
}
