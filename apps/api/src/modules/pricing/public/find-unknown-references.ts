import type { Configuration, PricingData } from '@roomwise/calc-engine';

export interface UnknownReference {
  field: string;
  id: string;
}

export function findUnknownReferences(
  configuration: Configuration,
  data: PricingData,
): UnknownReference[] {
  const roomTypeCodes = new Set(data.roomTypes.map((type) => type.code));
  const categoryIds = new Set(data.categories.map((category) => category.id));
  const productIds = new Set(data.products.map((product) => product.id));
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
        expectKnown(
          productIds,
          `${selectionPath}.productId`,
          selection.productId,
        );
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
