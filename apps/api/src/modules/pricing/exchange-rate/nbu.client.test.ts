import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env';
import {
  NBU_ERROR_KINDS,
  NbuClient,
  NbuError,
  parseNbuDate,
  parseNbuResponse,
} from './nbu.client';

const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';

const RECORDED = [
  {
    r030: 840,
    txt: 'Долар США',
    rate: 44.5483,
    cc: 'USD',
    exchangedate: '14.09.2026',
  },
];

function createClient() {
  const config = { get: () => NBU_URL } as unknown as ConfigService<
    AppEnv,
    true
  >;

  return new NbuClient(config);
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function kindOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(NbuError);
  return (error as NbuError).kind;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseNbuDate', () => {
  it('parses dd.mm.yyyy into a UTC date', () => {
    expect(parseNbuDate('14.09.2026').toISOString()).toBe(
      '2026-09-14T00:00:00.000Z',
    );
  });

  it.each([
    '2026-09-14',
    '14/09/2026',
    '1.9.2026',
    '31.02.2026',
    '14.13.2026',
    '00.09.2026',
    '',
  ])('rejects %j', (value) => {
    expect(() => parseNbuDate(value)).toThrow(NbuError);
  });
});

describe('parseNbuResponse', () => {
  it('picks the USD entry and formats the rate with 4 decimals', () => {
    expect(parseNbuResponse(RECORDED)).toEqual({
      rate: '44.5483',
      effectiveDate: new Date('2026-09-14T00:00:00.000Z'),
    });
    expect(parseNbuResponse([{ ...RECORDED[0], rate: 45 }]).rate).toBe(
      '45.0000',
    );
  });

  it.each([
    ['an empty array', []],
    ['a non-array', { rate: 1 }],
    ['a non-USD entry', [{ ...RECORDED[0], cc: 'EUR' }]],
    ['a zero rate', [{ ...RECORDED[0], rate: 0 }]],
    ['a negative rate', [{ ...RECORDED[0], rate: -1 }]],
    ['a string rate', [{ ...RECORDED[0], rate: '44.5' }]],
    ['a missing date', [{ ...RECORDED[0], exchangedate: undefined }]],
  ])('rejects %s as BAD_SHAPE', (_name, payload) => {
    expect(() => parseNbuResponse(payload)).toThrow(
      expect.objectContaining({ kind: NBU_ERROR_KINDS.BAD_SHAPE }),
    );
  });

  it('rejects a wrong date format as BAD_DATE', () => {
    expect(() =>
      parseNbuResponse([{ ...RECORDED[0], exchangedate: '2026-09-14' }]),
    ).toThrow(expect.objectContaining({ kind: NBU_ERROR_KINDS.BAD_DATE }));
  });
});

describe('NbuClient', () => {
  it('requests USD as JSON and returns the parsed rate', async () => {
    const fetchMock = stubFetch(jsonResponse(RECORDED));

    const result = await createClient().fetchUsdRate();

    expect(result.rate).toBe('44.5483');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.searchParams.get('valcode')).toBe('USD');
    expect(url.searchParams.has('json')).toBe(true);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps HTTP 500 to HTTP_STATUS', async () => {
    stubFetch(jsonResponse({}, 500));

    expect(await kindOf(createClient().fetchUsdRate())).toBe(
      NBU_ERROR_KINDS.HTTP_STATUS,
    );
  });

  it('maps an aborted request to TIMEOUT', async () => {
    stubFetch(new DOMException('timed out', 'TimeoutError'));

    expect(await kindOf(createClient().fetchUsdRate())).toBe(
      NBU_ERROR_KINDS.TIMEOUT,
    );
  });

  it('maps a failed connection to NETWORK', async () => {
    stubFetch(new TypeError('fetch failed'));

    expect(await kindOf(createClient().fetchUsdRate())).toBe(
      NBU_ERROR_KINDS.NETWORK,
    );
  });

  it('maps a non-JSON body to BAD_SHAPE', async () => {
    stubFetch(new Response('not json', { status: 200 }));

    expect(await kindOf(createClient().fetchUsdRate())).toBe(
      NBU_ERROR_KINDS.BAD_SHAPE,
    );
  });

  it('maps an empty array to BAD_SHAPE', async () => {
    stubFetch(jsonResponse([]));

    expect(await kindOf(createClient().fetchUsdRate())).toBe(
      NBU_ERROR_KINDS.BAD_SHAPE,
    );
  });
});
