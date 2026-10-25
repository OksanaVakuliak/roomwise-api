import type { Configuration, PricingData } from '@roomwise/calc-engine';

export interface UnknownReference {
  field: string;
  id: string;
}

export type MissingProductsPolicy = 'reject' | 'unavailable';

export function findUnknownReferences(
  configuration: Configuration,
  data: PricingData,
  missingProducts: MissingProductsPolicy = 'reject',
): UnknownReference[] {
  const roomTypeCodes = new Set(data.roomTypes.map((type) => type.code));
  const categoryIds = new Set(data.categories.map((category) => category.id));
  const productCategoryIds = new Map(
    data.products.map((product) => [product.id, product.categoryId]),
  );
  const optionIds = new Set(data.options.map((option) => option.id));
  const roomClientIds = new Set(
    configuration.rooms.map((room) => room.clientId),
  );
  const unknown: UnknownReference[] = [];
  const expectKnown = (known: Set<string>, field: string, id: string) => {
    if (!known.has(id)) {
      unknown.push({ field, id });
    }
  };

  configuration.rooms.forEach((room, roomIndex) => {
    const roomPath = `rooms[${roomIndex}]`;
    expectKnown(roomTypeCodes, `${roomPath}.roomTypeCode`, room.roomTypeCode);

    room.selections.forEach((selection, selectionIndex) => {
      const selectionPath = `${roomPath}.selections[${selectionIndex}]`;
      expectKnown(
        categoryIds,
        `${selectionPath}.categoryId`,
        selection.categoryId,
      );

      if (selection.productId !== null) {
        const productCategoryId = productCategoryIds.get(selection.productId);
        const tolerated =
          missingProducts === 'unavailable' && productCategoryId === undefined;

        if (!tolerated && productCategoryId !== selection.categoryId) {
          unknown.push({
            field: `${selectionPath}.productId`,
            id: selection.productId,
          });
        }
      }
    });
  });

  configuration.options.forEach((selection, optionIndex) => {
    const optionPath = `options[${optionIndex}]`;
    expectKnown(optionIds, `${optionPath}.optionId`, selection.optionId);

    selection.roomClientIds?.forEach((clientId, clientIndex) => {
      expectKnown(
        roomClientIds,
        `${optionPath}.roomClientIds[${clientIndex}]`,
        clientId,
      );
    });
  });

  return unknown;
}
