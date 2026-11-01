import type {
  Configuration,
  EstimateLine,
  EstimateWarning,
  PricingData,
} from '../schemas';
import { roomVariables } from '../variables';
import { collectWarnings } from './totals';

const roundArea = (value: number) => Math.round(value * 10_000) / 10_000;

function roomsAreaWarnings(
  configuration: Configuration,
  limits: PricingData['limits'],
): EstimateWarning[] {
  const totalAreaSqm = configuration.totalAreaSqm;
  if (configuration.scope !== 'FULL' || totalAreaSqm === null) {
    return [];
  }
  const roomsAreaSqm = roundArea(
    configuration.rooms.reduce(
      (sum, room) => sum + roomVariables(room).floorArea,
      0,
    ),
  );
  if (roomsAreaSqm > totalAreaSqm) {
    return [
      {
        code: 'ROOMS_AREA_EXCEEDS_TOTAL',
        params: { roomsAreaSqm, totalAreaSqm },
      },
    ];
  }
  const missingSqm = roundArea(totalAreaSqm - roomsAreaSqm);
  return missingSqm > limits.missingAreaHintSqm
    ? [{ code: 'ROOMS_AREA_BELOW_TOTAL', params: { missingSqm } }]
    : [];
}

export function estimateWarnings(
  lines: readonly EstimateLine[],
  configuration: Configuration,
  rate: string | null,
  limits: PricingData['limits'],
): EstimateWarning[] {
  return [
    ...collectWarnings(lines),
    ...roomsAreaWarnings(configuration, limits),
    ...(configuration.currency === 'UAH' && rate === null
      ? [{ code: 'EXCHANGE_RATE_UNAVAILABLE' }]
      : []),
  ];
}
