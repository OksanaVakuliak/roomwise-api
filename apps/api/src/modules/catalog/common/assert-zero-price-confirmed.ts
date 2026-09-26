import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';

export function assertZeroPriceConfirmed(
  priceCents: number,
  confirmZeroPrice: boolean | undefined,
): void {
  if (priceCents === 0 && confirmZeroPrice !== true) {
    throw new AppError(ERROR_CODES.ZERO_PRICE_NOT_CONFIRMED);
  }
}
