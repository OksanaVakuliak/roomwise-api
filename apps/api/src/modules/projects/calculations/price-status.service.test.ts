import type { Estimate, EstimateLine } from '@roomwise/calc-engine';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PricingEstimateService } from '../../pricing/estimate/pricing-estimate.service';
import type { PricingDataService } from '../../pricing/pricing-data/pricing-data.service';
import type { SnapshotV1 } from '../snapshot/snapshot.schema';
import { PriceStatusService } from './price-status.service';

function line(overrides: Partial<EstimateLine>): EstimateLine {
  return {
    id: 'line',
    section: 'MATERIALS',
    status: 'OK',
    roomClientId: null,
    categoryId: null,
    productId: null,
    optionId: null,
    packageItemId: null,
    ruleId: null,
    quantity: null,
    unit: null,
    unitPriceCents: null,
    amountCents: 100,
    amountUahKopecks: null,
    warnings: [],
    error: null,
    ...overrides,
  };
}

function makeSnapshot(lines: EstimateLine[]): SnapshotV1 {
  return {
    configuration: { marker: 'configuration' },
    lines,
  } as unknown as SnapshotV1;
}

function makeEstimate(totalUsdCents: number, lines: EstimateLine[]): Estimate {
  return { totals: { usdCents: totalUsdCents }, lines } as unknown as Estimate;
}

function setup() {
  let pricingVersion = 'v1';
  const pricingData = {
    get: vi.fn(async () => ({ version: pricingVersion })),
  };
  const pricingEstimate = { estimate: vi.fn() };
  const service = new PriceStatusService(
    pricingData as unknown as PricingDataService,
    pricingEstimate as unknown as PricingEstimateService,
  );

  return {
    service,
    pricingEstimate,
    setPricingVersion: (value: string) => {
      pricingVersion = value;
    },
    resolveEstimate: (estimate: Estimate) =>
      pricingEstimate.estimate.mockImplementation(async () => ({
        estimate,
        pricingData: { version: pricingVersion },
      })),
  };
}

const okLine = line({ id: 'a' });

function versionOf(id: string, lines: EstimateLine[] = [okLine]) {
  return { id, snapshot: makeSnapshot(lines), totalUsdCents: 1000 };
}

describe('PriceStatusService', () => {
  it('reports an unchanged price', async () => {
    const { service, resolveEstimate, pricingEstimate } = setup();
    resolveEstimate(makeEstimate(1000, [okLine]));

    const status = await service.current(versionOf('version-1'));

    expect(status).toEqual({
      changed: false,
      snapshotTotalUsdCents: 1000,
      currentTotalUsdCents: 1000,
      diffCents: 0,
      unavailableItems: [],
      currentPricingVersion: 'v1',
    });
    expect(pricingEstimate.estimate).toHaveBeenCalledWith({
      marker: 'configuration',
    });
  });

  it('reports the difference when the total changed', async () => {
    const { service, resolveEstimate } = setup();
    resolveEstimate(makeEstimate(1250, [okLine]));

    const status = await service.current(versionOf('version-1'));

    expect(status).toMatchObject({
      changed: true,
      currentTotalUsdCents: 1250,
      diffCents: 250,
    });
  });

  it('reports only lines that became unavailable since the snapshot', async () => {
    const { service, resolveEstimate } = setup();
    const unavailable = (id: string) =>
      line({
        id,
        status: 'UNAVAILABLE',
        productId: `product-${id}`,
        optionId: `option-${id}`,
      });
    resolveEstimate(
      makeEstimate(1000, [unavailable('old'), unavailable('new')]),
    );

    const status = await service.current(
      versionOf('version-1', [unavailable('old'), line({ id: 'new' })]),
    );

    expect(status).toMatchObject({
      changed: true,
      diffCents: 0,
      unavailableItems: [
        { lineId: 'new', productId: 'product-new', optionId: 'option-new' },
      ],
    });
  });

  it('ignores lines that were already unavailable in the snapshot', async () => {
    const { service, resolveEstimate } = setup();
    const unavailable = line({ id: 'old', status: 'UNAVAILABLE' });
    resolveEstimate(makeEstimate(1000, [unavailable]));

    const status = await service.current(versionOf('version-1', [unavailable]));

    expect(status).toMatchObject({ changed: false, unavailableItems: [] });
  });

  it('estimates once per version and pricing version', async () => {
    const { service, resolveEstimate, pricingEstimate, setPricingVersion } =
      setup();
    resolveEstimate(makeEstimate(1000, [okLine]));
    const version = versionOf('version-1');

    const first = await service.current(version);
    const second = await service.current(version);

    expect(second).toBe(first);
    expect(pricingEstimate.estimate).toHaveBeenCalledTimes(1);

    setPricingVersion('v2');
    const third = await service.current(version);

    expect(pricingEstimate.estimate).toHaveBeenCalledTimes(2);
    expect(third?.currentPricingVersion).toBe('v2');
  });

  it('evicts the oldest entry beyond 1000 cached statuses', async () => {
    const { service, resolveEstimate, pricingEstimate } = setup();
    resolveEstimate(makeEstimate(1000, [okLine]));

    for (let index = 0; index < 1001; index += 1) {
      await service.current(versionOf(`version-${index}`));
    }
    expect(pricingEstimate.estimate).toHaveBeenCalledTimes(1001);

    await service.current(versionOf('version-1000'));
    expect(pricingEstimate.estimate).toHaveBeenCalledTimes(1001);

    await service.current(versionOf('version-0'));
    expect(pricingEstimate.estimate).toHaveBeenCalledTimes(1002);
  });

  it.each([ERROR_CODES.UNKNOWN_REFERENCE, ERROR_CODES.INPUT_OUT_OF_BOUNDS])(
    'returns null and caches it on %s',
    async (code) => {
      const { service, pricingEstimate } = setup();
      pricingEstimate.estimate.mockRejectedValue(new AppError(code));
      const version = versionOf('version-1');

      expect(await service.current(version)).toBeNull();
      expect(await service.current(version)).toBeNull();
      expect(pricingEstimate.estimate).toHaveBeenCalledTimes(1);
    },
  );

  it('rethrows other errors', async () => {
    const { service, pricingEstimate } = setup();
    pricingEstimate.estimate.mockRejectedValue(new Error('boom'));

    await expect(service.current(versionOf('version-1'))).rejects.toThrow(
      'boom',
    );
  });

  it('builds a fresh status without estimating', () => {
    const { service, pricingEstimate } = setup();

    expect(service.fresh({ totalUsdCents: 700, pricingVersion: 'v9' })).toEqual(
      {
        changed: false,
        snapshotTotalUsdCents: 700,
        currentTotalUsdCents: 700,
        diffCents: 0,
        unavailableItems: [],
        currentPricingVersion: 'v9',
      },
    );
    expect(pricingEstimate.estimate).not.toHaveBeenCalled();
  });
});
