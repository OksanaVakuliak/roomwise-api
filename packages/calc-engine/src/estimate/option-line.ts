import { toCents } from '../money';
import type {
  Configuration,
  EstimateLine,
  OptionSelection,
  OptionUnit,
  PricingOption,
  RoomConfiguration,
} from '../schemas';
import { createLine, failedLine, roundQuantity } from './line';
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

export function optionLine(
  configuration: Configuration,
  option: PricingOption,
  selection: OptionSelection,
): EstimateLine {
  const init = {
    id: lineId(option.kind, 'option', option.id),
    section: option.kind,
    optionId: option.id,
  } as const;
  if (!option.available) {
    return failedLine(init, 'UNAVAILABLE', {
      code: 'PRODUCT_UNAVAILABLE',
      params: { optionId: option.id },
    });
  }
  const selected = configuration.rooms.filter((room) =>
    selection.roomClientIds?.includes(room.clientId),
  );
  const allowed = selected.filter((room) =>
    option.roomTypeCodes.includes(room.roomTypeCode),
  );
  const rejected = selected.filter((room) => !allowed.includes(room));
  const quantity = unitQuantity(
    option.unit,
    allowed,
    selection.quantity ?? option.minQuantity ?? 1,
  );
  return createLine({
    ...init,
    quantity: roundQuantity(quantity),
    unit: option.unit,
    unitPriceCents: option.priceCents,
    amountCents: toCents((option.priceCents / 100) * quantity),
    warnings: rejected.map((room) => ({
      code: 'OPTION_ROOM_TYPE_NOT_ALLOWED',
      params: { roomClientId: room.clientId, roomTypeCode: room.roomTypeCode },
    })),
  });
}

export function optionLines(
  configuration: Configuration,
  data: { readonly options: readonly PricingOption[] },
  kind: PricingOption['kind'],
): EstimateLine[] {
  return configuration.options.flatMap((selection) => {
    const option = data.options.find((item) => item.id === selection.optionId);
    return option?.kind === kind
      ? [optionLine(configuration, option, selection)]
      : [];
  });
}
