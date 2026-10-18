import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RateSource } from '../../../../generated/prisma/enums';

export const RATE_INTEGER_DIGITS = 8;
export const RATE_FRACTION_DIGITS = 4;

const quoteSchema = z.object({
  rate: z.string(),
  date: z.iso.date(),
});

export const exchangeRateStatusSchema = z.object({
  active: quoteSchema.extend({ source: z.enum(RateSource) }).nullable(),
  official: quoteSchema.nullable(),
  manual: quoteSchema.nullable(),
  lastSuccessfulFetchDate: z.iso.date().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  staleSince: z.iso.date().nullable(),
});

export const manualRateInputSchema = z.object({
  rate: z
    .string()
    .regex(
      new RegExp(
        `^\\d{1,${RATE_INTEGER_DIGITS}}(\\.\\d{1,${RATE_FRACTION_DIGITS}})?$`,
      ),
    )
    .refine((value) => Number(value) > 0),
});

export type ExchangeRateStatus = z.infer<typeof exchangeRateStatusSchema>;
export type ManualRateInput = z.infer<typeof manualRateInputSchema>;

export class ExchangeRateStatusDto extends createZodDto(
  exchangeRateStatusSchema,
) {}

export class ManualRateInputDto extends createZodDto(manualRateInputSchema) {}
