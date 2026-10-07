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

export const ConfigurationSchema = z.object({
  finishLevel: FinishLevelSchema,
  totalAreaSqm: z.number().positive(),
  balconyAreaSqm: z.number().min(0),
  balconyTiles: z.boolean(),
  gas: z.boolean(),
  kitchenType: KitchenTypeSchema,
  rooms: z.array(RoomConfigurationSchema),
  options: z.array(OptionSelectionSchema),
  currency: CurrencySchema,
});
export type Configuration = z.infer<typeof ConfigurationSchema>;
