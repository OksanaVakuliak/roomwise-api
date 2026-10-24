import {
  ConfigurationSchema,
  EstimateLineSchema,
  EstimateTotalsSchema,
  EstimateWarningSchema,
  ExchangeRateSchema,
  RoomConfigurationSchema,
} from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { imageRefSchema } from '../../catalog/public/dto/image-ref.schema';
import { priceStatusSchema } from '../calculations/price-status.schema';

const nullableText = z.string().nullable();

export const versionViewRoomSchema = RoomConfigurationSchema.omit({
  selections: true,
}).extend({ name: z.string() });

export const versionViewLineSchema = EstimateLineSchema.extend({
  roomName: nullableText,
  categoryName: nullableText,
  optionName: nullableText,
  packageItemName: nullableText,
  ruleName: nullableText,
  product: z
    .object({
      name: z.string(),
      brand: z.string(),
      manufacturer: z.string(),
      color: z.string(),
      size: z.string(),
      image: imageRefSchema.nullable(),
    })
    .nullable(),
});

export const versionViewSchema = z.object({
  publicId: z.string(),
  number: z.number().int(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  expired: z.boolean(),
  incomplete: z.boolean(),
  pricingVersion: z.string(),
  style: z.object({ id: z.string(), name: z.string() }).nullable(),
  configuration: ConfigurationSchema,
  rooms: z.array(versionViewRoomSchema),
  lines: z.array(versionViewLineSchema),
  totals: EstimateTotalsSchema,
  warnings: z.array(EstimateWarningSchema),
  exchangeRate: ExchangeRateSchema.nullable(),
  priceStatus: priceStatusSchema.nullable(),
  versions: z.array(
    z.object({
      number: z.number().int(),
      createdAt: z.iso.datetime(),
      totalUsdCents: z.number().int(),
      expired: z.boolean(),
    }),
  ),
});

export type VersionView = z.infer<typeof versionViewSchema>;

export class VersionViewDto extends createZodDto(versionViewSchema) {}
