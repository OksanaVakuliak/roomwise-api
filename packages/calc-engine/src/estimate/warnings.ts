import type {
  Configuration,
  EstimateLine,
  EstimateWarning,
  PricingData,
} from '../schemas';

const isHeatedFloorConflict = (
  line: EstimateLine,
  configuration: Configuration,
  data: PricingData,
): boolean => {
  if (line.section !== 'MATERIALS' || line.status === 'UNAVAILABLE') {
    return false;
  }
  const room = configuration.rooms.find(
    (item) => item.clientId === line.roomClientId,
  );
  const category = data.categories.find((item) => item.id === line.categoryId);
  const product = data.products.find((item) => item.id === line.productId);
  return (
    room?.heatedFloor === true &&
    category?.surface === 'FLOOR' &&
    product?.heatedFloorCompatible === false
  );
};

export function withLineWarnings(
  lines: readonly EstimateLine[],
  configuration: Configuration,
  data: PricingData,
): EstimateLine[] {
  return lines.map((line) =>
    isHeatedFloorConflict(line, configuration, data)
      ? {
          ...line,
          warnings: [
            ...line.warnings,
            {
              code: 'HEATED_FLOOR_INCOMPATIBLE',
              params: { productId: line.productId },
            },
          ],
        }
      : line,
  );
}

export function summaryWarnings(
  configuration: Configuration,
  data: PricingData,
): EstimateWarning[] {
  const roomsAreaSqm =
    Math.round(
      configuration.rooms.reduce(
        (sum, room) => sum + room.lengthM * room.widthM,
        0,
      ) * 100,
    ) / 100;
  return [
    ...(roomsAreaSqm > configuration.totalAreaSqm
      ? [
          {
            code: 'ROOMS_AREA_EXCEEDS_TOTAL',
            params: { roomsAreaSqm, totalAreaSqm: configuration.totalAreaSqm },
          },
        ]
      : []),
    ...(configuration.currency === 'UAH' && data.exchangeRate === null
      ? [{ code: 'EXCHANGE_RATE_UNAVAILABLE' }]
      : []),
  ];
}
