import { toCents } from '../money';
import type {
  Configuration,
  EstimateLine,
  PricingData,
  PricingPackageItem,
} from '../schemas';
import { createLine, failedLine, roundQuantity } from './line';
import { lineId } from './line-id';
import { optionLines, unitQuantity } from './option-line';

function packageLine(
  configuration: Configuration,
  item: PricingPackageItem,
): EstimateLine {
  const init = {
    id: lineId('ENGINEERING', 'package', item.id),
    section: 'ENGINEERING',
    packageItemId: item.id,
  } as const;
  if (item.includedInBase) {
    return createLine({ ...init, status: 'INCLUDED' });
  }
  if (item.priceCents === null || item.unit === null) {
    return failedLine(init, 'NOT_CALCULATED', {
      code: 'PACKAGE_ITEM_PRICE_MISSING',
      params: { packageItemId: item.id },
    });
  }
  const quantity = unitQuantity(item.unit, configuration.rooms, 1);
  return createLine({
    ...init,
    quantity: roundQuantity(quantity),
    unit: item.unit,
    unitPriceCents: item.priceCents,
    amountCents: toCents((item.priceCents / 100) * quantity),
  });
}

export function engineeringLines(
  configuration: Configuration,
  data: PricingData,
): EstimateLine[] {
  return [
    ...data.packageItems.map((item) => packageLine(configuration, item)),
    ...optionLines(configuration, data, 'ENGINEERING'),
  ];
}
