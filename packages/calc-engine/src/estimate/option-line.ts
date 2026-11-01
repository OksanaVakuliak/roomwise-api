import { toCents } from '../money';
import type {
  Configuration,
  EstimateLine,
  OptionSelection,
  OptionUnit,
  PricingData,
  PricingOption,
  RoomConfiguration,
} from '../schemas';
import { failedLine, pricedLine, roundQuantity } from './line';
import { lineId } from './line-id';

export function unitQuantity(
  unit: OptionUnit,
  rooms: readonly RoomConfiguration[],
  pieces: number,
): number {
  switch (unit) {
    case 'PIECE':
      return pieces;
    case 'PROJECT':
      return 1;
    case 'ROOM':
      return rooms.length;
    case 'ROOM_SQM':
      return rooms.reduce((sum, room) => sum + room.lengthM * room.widthM, 0);
  }
}

function optionUnitPriceCents(
  option: PricingOption,
  coefficients: PricingData['coefficients'],
): number | { readonly missingKey: string } {
  if (option.priceCoefficientKeys.length === 0) {
    return option.priceCents;
  }
  let dollars = 0;
  for (const key of option.priceCoefficientKeys) {
    const value = Object.hasOwn(coefficients, key)
      ? coefficients[key]
      : undefined;
    if (value === undefined) {
      return { missingKey: key };
    }
    dollars += value;
  }
  return toCents(dollars);
}

export function optionLine(
  configuration: Configuration,
  option: PricingOption,
  selection: OptionSelection,
  coefficients: PricingData['coefficients'] = {},
): EstimateLine {
  const init = {
    id: lineId(option.kind, 'option', option.id),
    section: option.kind,
    optionId: option.id,
  } as const;
  if (!option.scopes.includes(configuration.scope)) {
    return failedLine(init, 'UNAVAILABLE', {
      code: 'OPTION_SCOPE_NOT_ALLOWED',
      params: { optionId: option.id, scope: configuration.scope },
    });
  }
  if (!option.available) {
    return failedLine(init, 'UNAVAILABLE', {
      code: 'PRODUCT_UNAVAILABLE',
      params: { optionId: option.id },
    });
  }
  const unitPriceCents = optionUnitPriceCents(option, coefficients);
  if (typeof unitPriceCents !== 'number') {
    return failedLine(init, 'ERROR', {
      code: 'UNKNOWN_COEFFICIENT',
      params: { key: unitPriceCents.missingKey },
    });
  }
  const selected = configuration.rooms.filter((room) =>
    selection.roomClientIds?.includes(room.clientId),
  );
  const allowed =
    option.roomTypeCodes.length === 0
      ? selected
      : selected.filter((room) =>
          option.roomTypeCodes.includes(room.roomTypeCode),
        );
  const rejected = selected.filter((room) => !allowed.includes(room));
  const quantity = unitQuantity(
    option.unit,
    allowed,
    selection.quantity ?? option.minQuantity ?? 1,
  );
  return pricedLine(
    {
      ...init,
      quantity: roundQuantity(quantity),
      unit: option.unit,
      unitPriceCents,
      warnings: rejected.map((room) => ({
        code: 'OPTION_ROOM_TYPE_NOT_ALLOWED',
        params: {
          roomClientId: room.clientId,
          roomTypeCode: room.roomTypeCode,
        },
      })),
    },
    (unitPriceCents / 100) * quantity,
  );
}

export function optionLines(
  configuration: Configuration,
  data: Pick<PricingData, 'options' | 'coefficients'>,
  kind: PricingOption['kind'],
): EstimateLine[] {
  return configuration.options.flatMap((selection) => {
    const option = data.options.find((item) => item.id === selection.optionId);
    return option?.kind === kind
      ? [optionLine(configuration, option, selection, data.coefficients)]
      : [];
  });
}
