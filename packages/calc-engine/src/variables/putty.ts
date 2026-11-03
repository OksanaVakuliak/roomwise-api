import type { PricingCategory, RoomConfiguration } from '../schemas';

export function puttyRequiredOn(
  room: RoomConfiguration,
  surface: PricingCategory['surface'],
  categories: readonly PricingCategory[],
): boolean {
  const selected = categories.filter(
    (category) =>
      category.surface === surface &&
      room.selections.some((selection) => selection.categoryId === category.id),
  );
  return (
    selected.length === 0 || selected.some((category) => category.requiresPutty)
  );
}
