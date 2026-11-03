import type {
  EstimateMessage,
  PricingCategory,
  RoomConfiguration,
  RoomSelection,
} from '../schemas';
import { puttyRequiredOn } from './putty';

export type ShareSurface = 'WALLS' | 'FLOOR';

export interface SurfaceShares {
  readonly selections: readonly RoomSelection[];
  readonly shared: boolean;
  readonly complete: boolean;
  readonly totalPercent: number;
}

export function isShareSurface(
  surface: PricingCategory['surface'],
): surface is ShareSurface {
  return surface === 'WALLS' || surface === 'FLOOR';
}

export function surfaceShares(
  room: RoomConfiguration,
  surface: ShareSurface,
  categories: readonly PricingCategory[],
): SurfaceShares {
  const selections = room.selections.filter(
    (selection) =>
      selection.productId !== null &&
      categories.some(
        (category) =>
          category.id === selection.categoryId && category.surface === surface,
      ),
  );
  const shared = selections.some(
    (selection) => selection.areaShare !== undefined,
  );
  return {
    selections,
    shared,
    complete: selections.every(
      (selection) => selection.areaShare !== undefined,
    ),
    totalPercent: selections.reduce(
      (sum, selection) => sum + (selection.areaShare ?? 0),
      0,
    ),
  };
}

export function areaShareOf(selection: RoomSelection): number {
  return selection.areaShare === undefined ? 1 : selection.areaShare / 100;
}

export function areaShareError(
  room: RoomConfiguration,
  selection: RoomSelection,
  categories: readonly PricingCategory[],
): EstimateMessage | null {
  const category = categories.find((item) => item.id === selection.categoryId);
  if (category === undefined) {
    return null;
  }
  if (!isShareSurface(category.surface)) {
    return selection.areaShare === undefined
      ? null
      : {
          code: 'AREA_SHARE_NOT_ALLOWED',
          params: { categoryId: category.id, surface: category.surface },
        };
  }
  const shares = surfaceShares(room, category.surface, categories);
  const params = { roomClientId: room.clientId, surface: category.surface };
  if (shares.shared && !shares.complete) {
    return { code: 'AREA_SHARE_MISSING', params };
  }
  if (shares.totalPercent > 100) {
    return {
      code: 'AREA_SHARE_EXCEEDS_SURFACE',
      params: { ...params, percent: shares.totalPercent },
    };
  }
  return null;
}

export function puttyShareOn(
  room: RoomConfiguration,
  categories: readonly PricingCategory[],
): number {
  const { selections, shared } = surfaceShares(room, 'WALLS', categories);
  if (!shared) {
    return puttyRequiredOn(room, 'WALLS', categories) ? 1 : 0;
  }
  const needing = selections.filter(
    (selection) =>
      categories.find((category) => category.id === selection.categoryId)
        ?.requiresPutty,
  );
  return Math.min(
    1,
    needing.reduce((sum, selection) => sum + areaShareOf(selection), 0),
  );
}
