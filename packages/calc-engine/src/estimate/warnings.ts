import type {
  Configuration,
  EstimateLine,
  EstimateWarning,
  PricingData,
} from '../schemas';
import { roomVariables, surfaceAreaOf, surfaceShares } from '../variables';
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

const SHARE_SURFACES = ['WALLS', 'FLOOR'] as const;

function areaShareWarnings(
  configuration: Configuration,
  categories: PricingData['categories'],
): EstimateWarning[] {
  return configuration.rooms.flatMap((room) => {
    const variables = roomVariables(room);
    return SHARE_SURFACES.flatMap((surface) => {
      const shares = surfaceShares(room, surface, categories);
      if (!shares.shared || !shares.complete || shares.totalPercent >= 100) {
        return [];
      }
      const percent = 100 - shares.totalPercent;
      const area = surfaceAreaOf(variables, surface);
      return [
        {
          code: 'AREA_SHARE_UNALLOCATED',
          params: {
            roomClientId: room.clientId,
            surface,
            percent,
            sqm: roundArea((area * percent) / 100),
          },
        },
      ];
    });
  });
}

export function estimateWarnings(
  lines: readonly EstimateLine[],
  configuration: Configuration,
  rate: string | null,
  data: PricingData,
): EstimateWarning[] {
  return [
    ...collectWarnings(lines),
    ...roomsAreaWarnings(configuration, data.limits),
    ...areaShareWarnings(configuration, data.categories),
    ...(configuration.currency === 'UAH' && rate === null
      ? [{ code: 'EXCHANGE_RATE_UNAVAILABLE' }]
      : []),
  ];
}
