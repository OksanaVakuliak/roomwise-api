import { z } from 'zod';
import {
  CurrencySchema,
  FinishLevelSchema,
  KitchenTypeSchema,
  RoomTypeCodeSchema,
} from './common';

export const RoomSelectionSchema = z.object({
  categoryId: z.string(),
  productId: z.string().nullable(),
});
export type RoomSelection = z.infer<typeof RoomSelectionSchema>;

export const RoomConfigurationSchema = z.object({
  clientId: z.string(),
  name: z.string().trim().min(1).max(60).optional(),
  roomTypeCode: RoomTypeCodeSchema,
  lengthM: z.number().positive(),
  widthM: z.number().positive(),
  heightM: z.number().positive(),
  heatedFloor: z.boolean(),
  selections: z.array(RoomSelectionSchema),
});
export type RoomConfiguration = z.infer<typeof RoomConfigurationSchema>;

export const OptionSelectionSchema = z.object({
  optionId: z.string(),
  quantity: z.int().positive().optional(),
  roomClientIds: z.array(z.string()).optional(),
});
export type OptionSelection = z.infer<typeof OptionSelectionSchema>;

function duplicateIndexes<T>(
  items: readonly T[],
  key: (item: T) => string,
): number[] {
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const value = key(item);
    if (seen.has(value)) {
      return [index];
    }
    seen.add(value);
    return [];
  });
}

export const ConfigurationSchema = z
  .object({
    finishLevel: FinishLevelSchema,
    totalAreaSqm: z.number().positive(),
    balconyAreaSqm: z.number().min(0),
    balconyTiles: z.boolean(),
    gas: z.boolean(),
    kitchenType: KitchenTypeSchema,
    rooms: z.array(RoomConfigurationSchema),
    options: z.array(OptionSelectionSchema),
    currency: CurrencySchema,
  })
  .superRefine((configuration, ctx) => {
    const addDuplicate = (path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', path, message: 'Duplicate' });

    for (const index of duplicateIndexes(
      configuration.rooms,
      (room) => room.clientId,
    )) {
      addDuplicate(['rooms', index, 'clientId']);
    }
    configuration.rooms.forEach((room, roomIndex) => {
      for (const index of duplicateIndexes(
        room.selections,
        (selection) => selection.categoryId,
      )) {
        addDuplicate(['rooms', roomIndex, 'selections', index, 'categoryId']);
      }
    });
    for (const index of duplicateIndexes(
      configuration.options,
      (option) => option.optionId,
    )) {
      addDuplicate(['options', index, 'optionId']);
    }
  });
export type Configuration = z.infer<typeof ConfigurationSchema>;
