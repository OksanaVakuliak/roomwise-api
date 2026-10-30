import { describe, expect, it } from 'vitest';
import {
  type Configuration,
  ConfigurationSchema,
  checkLimits,
  EstimateSchema,
  estimate,
  PricingDataSchema,
} from '../src';
import reference from './fixtures/reference/us1-reference.json';

const ROOM_COUNT = 15;
const BUDGET_MS = 50;
const WARM_UP_RUNS = 20;
const MEASURED_RUNS = 25;

const data = PricingDataSchema.parse(reference.pricingData);

const configuration: Configuration = ConfigurationSchema.parse({
  finishLevel: 'PRE_FINISH',
  totalAreaSqm: 400,
  balconyAreaSqm: 6,
  balconyTiles: true,
  kitchenType: 'SEPARATE',
  rooms: Array.from({ length: ROOM_COUNT }, (_, index) => ({
    clientId: `room-${index + 1}`,
    roomTypeCode: data.roomTypes[index % data.roomTypes.length]
      .code as Configuration['rooms'][number]['roomTypeCode'],
    lengthM: 4 + (index % 3),
    widthM: 3 + (index % 4),
    heightM: 2.7,
    heatedFloor: true,
    selections: data.categories.map((category) => ({
      categoryId: category.id,
      productId:
        data.products.find(
          (product) => product.categoryId === category.id && product.available,
        )?.id ?? null,
    })),
  })),
  options: data.options.map((option) => {
    if (option.unit === 'PIECE') {
      return {
        optionId: option.id,
        quantity: option.maxQuantity ?? option.minQuantity ?? 1,
      };
    }
    if (option.unit === 'PROJECT') {
      return { optionId: option.id };
    }
    return {
      optionId: option.id,
      roomClientIds: Array.from(
        { length: ROOM_COUNT },
        (_, index) => `room-${index + 1}`,
      ),
    };
  }),
  currency: 'UAH',
} satisfies Configuration);

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('estimate performance (SC-001)', () => {
  it('uses a configuration the API accepts', () => {
    expect(checkLimits(configuration, data.limits, data.options)).toEqual([]);
  });

  it('evaluates a full estimate rather than exiting early', () => {
    const result = estimate(configuration, data);
    EstimateSchema.parse(result);
    expect(result.incomplete).toBe(false);
    expect(result.lines.filter((line) => line.status === 'ERROR')).toEqual([]);
    expect(result.lines.length).toBeGreaterThan(
      configuration.rooms.length * data.categories.length,
    );
    expect(result.totals.usdCents).toBeGreaterThan(0);
  });

  it(`estimates ${ROOM_COUNT} rooms with all categories and options in under ${BUDGET_MS} ms`, () => {
    for (let run = 0; run < WARM_UP_RUNS; run += 1) {
      estimate(configuration, data);
    }
    const durations = Array.from({ length: MEASURED_RUNS }, () => {
      const start = performance.now();
      estimate(configuration, data);
      return performance.now() - start;
    });
    expect(median(durations)).toBeLessThan(BUDGET_MS);
  });
});
