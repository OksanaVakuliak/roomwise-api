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
import {
  CATEGORY,
  PRODUCT,
  partialConfiguration,
  room,
  scopeData,
  select,
} from './fixtures/scope';

const ROOM_COUNT = 15;
const BUDGET_MS = 50;
const WARM_UP_RUNS = 20;
const MEASURED_RUNS = 25;

const data = PricingDataSchema.parse(reference.pricingData);

const configuration: Configuration = ConfigurationSchema.parse({
  scope: 'FULL',
  finishLevel: 'PRE_FINISH',
  totalAreaSqm: 400,
  balconyAreaSqm: 6,
  balconyTiles: true,
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

const partialConfig: Configuration = ConfigurationSchema.parse(
  partialConfiguration({
    finishLevel: 'ROUGH',
    rooms: Array.from({ length: ROOM_COUNT }, (_, index) =>
      room(`room-${index + 1}`, {
        lengthM: 4 + (index % 3),
        widthM: 3 + (index % 4),
        selections: [
          select(CATEGORY.floor, PRODUCT.floor),
          select(CATEGORY.wallPaint, PRODUCT.wallPaint),
          select(CATEGORY.wallTile, PRODUCT.wallTile),
          select(CATEGORY.ceiling, PRODUCT.ceiling),
          select(CATEGORY.skirting, PRODUCT.skirting),
        ],
      }),
    ),
  }),
);

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const scenarios = [
  { name: 'full renovation', configuration, data },
  { name: 'partial renovation', configuration: partialConfig, data: scopeData },
];

describe.each(scenarios)('estimate performance (SC-001), $name', (scenario) => {
  it('uses a configuration the API accepts', () => {
    expect(
      checkLimits(
        scenario.configuration,
        scenario.data.limits,
        scenario.data.options,
      ),
    ).toEqual([]);
  });

  it('evaluates a full estimate rather than exiting early', () => {
    const result = estimate(scenario.configuration, scenario.data);
    EstimateSchema.parse(result);
    expect(result.incomplete).toBe(false);
    expect(result.lines.filter((line) => line.status === 'ERROR')).toEqual([]);
    expect(result.lines.length).toBeGreaterThan(
      scenario.configuration.rooms.length * 3,
    );
    expect(result.totals.usdCents).toBeGreaterThan(0);
  });

  it(`estimates ${ROOM_COUNT} rooms in under ${BUDGET_MS} ms`, () => {
    for (let run = 0; run < WARM_UP_RUNS; run += 1) {
      estimate(scenario.configuration, scenario.data);
    }
    const durations = Array.from({ length: MEASURED_RUNS }, () => {
      const start = performance.now();
      estimate(scenario.configuration, scenario.data);
      return performance.now() - start;
    });
    expect(median(durations)).toBeLessThan(BUDGET_MS);
  });
});

describe('partial renovation surfaces', () => {
  it('shares the wall preparation between the categories of one surface', () => {
    const result = estimate(partialConfig, scopeData);
    const prep = result.lines.flatMap((line) =>
      (line.components ?? []).filter((item) => item.kind === 'PREP'),
    );
    expect(prep.some((item) => item.sharedWithCategoryId !== undefined)).toBe(
      true,
    );
    expect(prep.some((item) => item.amountCents > 0)).toBe(true);
  });
});
