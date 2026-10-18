import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AppEnv } from '../../../config/env';

const REQUEST_TIMEOUT_MS = 10_000;
const USD_CODE = 'USD';
const RATE_FRACTION_DIGITS = 4;
const NBU_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export const NBU_ERROR_KINDS = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  HTTP_STATUS: 'HTTP_STATUS',
  BAD_SHAPE: 'BAD_SHAPE',
  BAD_DATE: 'BAD_DATE',
} as const;

export type NbuErrorKind =
  (typeof NBU_ERROR_KINDS)[keyof typeof NBU_ERROR_KINDS];

export class NbuError extends Error {
  constructor(
    readonly kind: NbuErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'NbuError';
  }
}

export interface NbuRate {
  rate: string;
  effectiveDate: Date;
}

const nbuEntrySchema = z.object({
  r030: z.number(),
  txt: z.string(),
  rate: z.number().positive().finite(),
  cc: z.string(),
  exchangedate: z.string(),
});

const nbuResponseSchema = z.array(nbuEntrySchema);

export function parseNbuDate(value: string): Date {
  const match = NBU_DATE_PATTERN.exec(value);

  if (!match) {
    throw new NbuError(
      NBU_ERROR_KINDS.BAD_DATE,
      `NBU date "${value}" is not dd.mm.yyyy`,
    );
  }

  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    throw new NbuError(
      NBU_ERROR_KINDS.BAD_DATE,
      `NBU date "${value}" is not a calendar date`,
    );
  }

  return date;
}

export function parseNbuResponse(payload: unknown): NbuRate {
  const parsed = nbuResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new NbuError(
      NBU_ERROR_KINDS.BAD_SHAPE,
      'NBU response does not match the expected shape',
    );
  }

  const usd = parsed.data.find((entry) => entry.cc === USD_CODE);

  if (!usd) {
    throw new NbuError(NBU_ERROR_KINDS.BAD_SHAPE, 'NBU response has no USD');
  }

  return {
    rate: usd.rate.toFixed(RATE_FRACTION_DIGITS),
    effectiveDate: parseNbuDate(usd.exchangedate),
  };
}

@Injectable()
export class NbuClient {
  private readonly url: string;

  constructor(@Inject(ConfigService) config: ConfigService<AppEnv, true>) {
    this.url = config.get('NBU_API_URL', { infer: true });
  }

  async fetchUsdRate(): Promise<NbuRate> {
    const response = await this.request();

    if (!response.ok) {
      throw new NbuError(
        NBU_ERROR_KINDS.HTTP_STATUS,
        `NBU responded with HTTP ${response.status}`,
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new NbuError(
        NBU_ERROR_KINDS.BAD_SHAPE,
        'NBU response is not valid JSON',
      );
    }

    return parseNbuResponse(payload);
  }

  private async request(): Promise<Response> {
    const url = new URL(this.url);
    url.searchParams.set('valcode', USD_CODE);
    url.searchParams.set('json', '');

    try {
      return await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new NbuError(
          NBU_ERROR_KINDS.TIMEOUT,
          `NBU did not respond within ${REQUEST_TIMEOUT_MS} ms`,
        );
      }

      throw new NbuError(
        NBU_ERROR_KINDS.NETWORK,
        `NBU request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
