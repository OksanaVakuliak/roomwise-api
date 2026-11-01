import type { Configuration, EstimateLine, EstimateWarning } from '../schemas';
import { roomVariables } from '../variables';
import { collectWarnings } from './totals';

function roomsAreaWarnings(configuration: Configuration): EstimateWarning[] {
  const totalAreaSqm = configuration.totalAreaSqm;
  if (totalAreaSqm === null) {
    return [];
  }
  const roomsAreaSqm =
    Math.round(
      configuration.rooms.reduce(
        (sum, room) => sum + roomVariables(room).floorArea,
        0,
      ) * 10_000,
    ) / 10_000;
  return roomsAreaSqm > totalAreaSqm
    ? [
        {
          code: 'ROOMS_AREA_EXCEEDS_TOTAL',
          params: { roomsAreaSqm, totalAreaSqm },
        },
      ]
    : [];
}

export function estimateWarnings(
  lines: readonly EstimateLine[],
  configuration: Configuration,
  rate: string | null,
): EstimateWarning[] {
  return [
    ...collectWarnings(lines),
    ...roomsAreaWarnings(configuration),
    ...(configuration.currency === 'UAH' && rate === null
      ? [{ code: 'EXCHANGE_RATE_UNAVAILABLE' }]
      : []),
  ];
}
