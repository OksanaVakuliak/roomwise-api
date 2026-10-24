import { z } from 'zod';

export const priceStatusSchema = z.object({
  changed: z.boolean(),
  snapshotTotalUsdCents: z.number().int(),
  currentTotalUsdCents: z.number().int(),
  diffCents: z.number().int(),
  unavailableItems: z.array(
    z.object({
      lineId: z.string(),
      productId: z.string().nullable(),
      optionId: z.string().nullable(),
    }),
  ),
  currentPricingVersion: z.string(),
});
export type PriceStatus = z.infer<typeof priceStatusSchema>;
