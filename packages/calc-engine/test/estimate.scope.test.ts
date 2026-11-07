import { describe, expect, it } from 'vitest';
import {
  type Estimate,
  EstimateSchema,
  estimate,
  PricingDataSchema,
} from '../src';
import {
  CATEGORY,
  fullConfiguration,
  OPTION,
  PACKAGE_ITEM,
  PRICE_CENTS,
  PRODUCT,
  partialConfiguration,
  RULE,
  room,
  scopeData,
  select,
} from './fixtures/scope';
import { expectEstimateInvariants } from './support/invariants';

function run(...args: Parameters<typeof estimate>): Estimate {
  const result = estimate(...args);
  expect(EstimateSchema.safeParse(result).success).toBe(true);
  expectEstimateInvariants(result);
  for (const line of result.lines) {
    if (line.components !== undefined) {
      const componentsCents = line.components.reduce(
        (sum, component) => sum + component.amountCents,
        0,
      );
      expect(line.amountCents).toBe(componentsCents);
    }
  }
  return result;
}

const lineOf = (result: Estimate, id: string) =>
  result.lines.find((line) => line.id === id);

const sectionOf = (
  result: Estimate,
  section: Estimate['lines'][number]['section'],
) => result.lines.filter((line) => line.section === section);

const componentOf = (
  line: Estimate['lines'][number] | undefined,
  kind: 'MATERIAL' | 'LABOR' | 'PREP',
) => line?.components?.find((component) => component.kind === kind);

const sumCents = (lines: Estimate['lines']) =>
  lines.reduce((sum, line) => sum + line.amountCents, 0);

const floorLineId = (roomClientId: string) =>
  `MATERIALS:${roomClientId}:${CATEGORY.floor}`;

describe('scope fixture', () => {
  it('is valid pricing data', () => {
    expect(PricingDataSchema.safeParse(scopeData).success).toBe(true);
  });
});

describe('estimate renovation scope', () => {
  it.each([15, 60, 500])(
    'E3 FULL base of ROUGH exceeds PRE_FINISH for %d sqm',
    (totalAreaSqm) => {
      const sideM = totalAreaSqm / 10;
      const rooms = [
        room('living', {
          roomTypeCode: 'LIVING_ROOM',
          lengthM: 5,
          widthM: sideM,
        }),
        room('bath', { roomTypeCode: 'BATHROOM', lengthM: 5, widthM: sideM }),
      ];
      const roomsFloorArea = totalAreaSqm;
      const roomsWallArea = 2 * 2 * (5 + sideM) * 2.5;
      const wetRoomsCount = 1;
      const rough = run(
        fullConfiguration({ finishLevel: 'ROUGH', totalAreaSqm, rooms }),
        scopeData,
      );
      const preFinish = run(
        fullConfiguration({ finishLevel: 'PRE_FINISH', totalAreaSqm, rooms }),
        scopeData,
      );
      const roughBaseCents = sumCents(sectionOf(rough, 'BASE'));
      const preFinishBaseCents = sumCents(sectionOf(preFinish, 'BASE'));
      const cleaningCents = Math.round(roomsFloorArea * 120);
      const screedCents = Math.round(roomsFloorArea * (830 + 1480));
      const plasterCents = Math.round(roomsWallArea * (790 + 500));
      const electricsCents = Math.round(roomsFloorArea * (920 + 1100));
      const plumbingCents = wetRoomsCount * (11300 + 5600);
      expect(preFinishBaseCents).toBe(cleaningCents);
      expect(roughBaseCents).toBe(
        cleaningCents +
          screedCents +
          plasterCents +
          electricsCents +
          plumbingCents,
      );
      expect(roughBaseCents).toBeGreaterThan(preFinishBaseCents);
    },
  );

  it('E4 FULL LIVED_IN has a demolition rule among BASE lines', () => {
    const roomsFloorArea = 12;
    const result = run(
      fullConfiguration({
        finishLevel: 'LIVED_IN',
        totalAreaSqm: 12,
        rooms: [room('bedroom')],
      }),
      scopeData,
    );
    const base = sectionOf(result, 'BASE');
    const demolition = base.find((line) => line.ruleId === RULE.baseDemolition);
    expect(demolition?.status).toBe('OK');
    expect(demolition?.amountCents).toBe(
      Math.round(roomsFloorArea * (350 + 280)),
    );
    expect(base.map((line) => line.ruleId)).not.toContain(RULE.baseScreed);
    const rough = run(
      fullConfiguration({
        finishLevel: 'ROUGH',
        totalAreaSqm: 12,
        rooms: [room('bedroom')],
      }),
      scopeData,
    );
    expect(sectionOf(rough, 'BASE').map((line) => line.ruleId)).not.toContain(
      RULE.baseDemolition,
    );
  });

  it('E5 PARTIAL has no BASE lines and no package items', () => {
    const configuration = partialConfiguration({
      rooms: [
        room('bedroom', {
          selections: [select(CATEGORY.floor, PRODUCT.floor)],
        }),
      ],
    });
    const partial = run(configuration, scopeData);
    expect(sectionOf(partial, 'BASE')).toEqual([]);
    const packageLines = partial.lines.filter(
      (line) => line.packageItemId !== null,
    );
    expect(packageLines).toEqual([]);

    const full = run(
      fullConfiguration({
        totalAreaSqm: 12,
        rooms: configuration.rooms,
      }),
      scopeData,
    );
    const included = full.lines.find(
      (line) => line.packageItemId === PACKAGE_ITEM.included,
    );
    expect(included?.status).toBe('INCLUDED');
    const charged = full.lines.find(
      (line) => line.packageItemId === PACKAGE_ITEM.charged,
    );
    expect(charged?.amountCents).toBe(PRICE_CENTS.chargedPackageItem);
  });

  it('E5b PARTIAL without categories has no priced lines', () => {
    const empty = run(
      partialConfiguration({ rooms: [room('bedroom')] }),
      scopeData,
    );
    expect(empty.lines.filter((line) => line.amountCents > 0)).toEqual([]);
    expect(empty.totals.usdCents).toBe(0);
  });

  it('E6 PARTIAL ROUGH bedroom laminate is MATERIAL + LABOR + PREP', () => {
    const floorArea = 12;
    const materialCents = floorArea * (PRICE_CENTS.floor + 200);
    const laborCents = floorArea * 700;
    const prepCents = floorArea * (830 + 1480);
    const result = run(
      partialConfiguration({
        finishLevel: 'ROUGH',
        rooms: [
          room('bedroom', {
            selections: [select(CATEGORY.floor, PRODUCT.floor)],
          }),
        ],
      }),
      scopeData,
    );
    const line = lineOf(result, floorLineId('bedroom'));
    expect(line?.status).toBe('OK');
    expect(line?.components).toHaveLength(3);
    expect(componentOf(line, 'MATERIAL')).toMatchObject({
      ruleId: RULE.floor,
      amountCents: materialCents,
    });
    expect(componentOf(line, 'LABOR')).toMatchObject({
      ruleId: RULE.floor,
      amountCents: laborCents,
    });
    expect(componentOf(line, 'PREP')).toMatchObject({
      ruleId: RULE.surfaceFloor,
      amountCents: prepCents,
    });
    expect(line?.amountCents).toBe(materialCents + laborCents + prepCents);
    expect(sectionOf(result, 'BASE')).toEqual([]);
  });

  it('E7 PARTIAL PRE_FINISH keeps a zero PREP component', () => {
    const floorArea = 12;
    const materialCents = floorArea * (PRICE_CENTS.floor + 200);
    const laborCents = floorArea * 700;
    const screedCents = floorArea * (830 + 1480);
    const rooms = [
      room('bedroom', { selections: [select(CATEGORY.floor, PRODUCT.floor)] }),
    ];
    const rough = lineOf(
      run(partialConfiguration({ finishLevel: 'ROUGH', rooms }), scopeData),
      floorLineId('bedroom'),
    );
    const preFinish = lineOf(
      run(
        partialConfiguration({ finishLevel: 'PRE_FINISH', rooms }),
        scopeData,
      ),
      floorLineId('bedroom'),
    );
    expect(preFinish?.components).toHaveLength(3);
    expect(componentOf(preFinish, 'PREP')).toMatchObject({
      ruleId: RULE.surfaceFloor,
      amountCents: 0,
    });
    expect(preFinish?.amountCents).toBe(materialCents + laborCents);
    expect((rough?.amountCents ?? 0) - (preFinish?.amountCents ?? 0)).toBe(
      screedCents,
    );
  });

  it('E8 PARTIAL wall PREP sits only in the first category of the room', () => {
    const bedroomWallArea = 35;
    const livingWallArea = 45;
    const wallPrepPerSqmCents = 790 + 500 + 810 + 160;
    const result = run(
      partialConfiguration({
        finishLevel: 'ROUGH',
        rooms: [
          room('bedroom', {
            selections: [
              select(CATEGORY.wallPaint, PRODUCT.wallPaint),
              select(CATEGORY.wallTile, PRODUCT.wallTile),
            ],
          }),
          room('living', {
            roomTypeCode: 'LIVING_ROOM',
            lengthM: 5,
            widthM: 4,
            selections: [
              select(CATEGORY.wallTile, PRODUCT.wallTile),
              select(CATEGORY.wallPaint, PRODUCT.wallPaint),
            ],
          }),
        ],
      }),
      scopeData,
    );
    const bedroomPaint = lineOf(
      result,
      `MATERIALS:bedroom:${CATEGORY.wallPaint}`,
    );
    const bedroomTile = lineOf(
      result,
      `MATERIALS:bedroom:${CATEGORY.wallTile}`,
    );
    expect(componentOf(bedroomPaint, 'PREP')).toEqual({
      kind: 'PREP',
      ruleId: RULE.surfaceWalls,
      amountCents: bedroomWallArea * wallPrepPerSqmCents,
    });
    expect(componentOf(bedroomTile, 'PREP')).toEqual({
      kind: 'PREP',
      ruleId: RULE.surfaceWalls,
      amountCents: 0,
      sharedWithCategoryId: CATEGORY.wallPaint,
    });
    const livingPaint = lineOf(
      result,
      `MATERIALS:living:${CATEGORY.wallPaint}`,
    );
    const livingTile = lineOf(result, `MATERIALS:living:${CATEGORY.wallTile}`);
    expect(componentOf(livingTile, 'PREP')).toEqual({
      kind: 'PREP',
      ruleId: RULE.surfaceWalls,
      amountCents: livingWallArea * wallPrepPerSqmCents,
    });
    expect(componentOf(livingPaint, 'PREP')).toEqual({
      kind: 'PREP',
      ruleId: RULE.surfaceWalls,
      amountCents: 0,
      sharedWithCategoryId: CATEGORY.wallTile,
    });
    expect(componentOf(bedroomPaint, 'MATERIAL')?.amountCents).toBe(
      bedroomWallArea * PRICE_CENTS.wallPaint,
    );
    expect(componentOf(bedroomTile, 'LABOR')?.amountCents).toBe(
      bedroomWallArea * 1970,
    );
  });

  it('E9 PARTIAL rule without laborFormula gives LABOR 0 and a warning', () => {
    const perimeter = 14;
    const result = run(
      partialConfiguration({
        rooms: [
          room('bedroom', {
            selections: [
              select(CATEGORY.skirting, PRODUCT.skirting),
              select(CATEGORY.floor, PRODUCT.floor),
            ],
          }),
        ],
      }),
      scopeData,
    );
    const skirtingId = `MATERIALS:bedroom:${CATEGORY.skirting}`;
    const skirting = lineOf(result, skirtingId);
    expect(skirting?.status).toBe('OK');
    expect(componentOf(skirting, 'LABOR')).toMatchObject({
      ruleId: RULE.skirting,
      amountCents: 0,
    });
    expect(componentOf(skirting, 'PREP')).toBeUndefined();
    expect(skirting?.amountCents).toBe(perimeter * PRICE_CENTS.skirting);
    expect(skirting?.warnings.map((warning) => warning.code)).toContain(
      'LABOR_RATE_MISSING',
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'LABOR_RATE_MISSING',
        lineId: skirtingId,
      }),
    );
    const floor = lineOf(result, floorLineId('bedroom'));
    expect(floor?.warnings.map((warning) => warning.code)).not.toContain(
      'LABOR_RATE_MISSING',
    );
  });

  it('E10 FULL runs neither laborFormula nor SURFACE rules', () => {
    const floorArea = 12;
    const configuration = fullConfiguration({
      totalAreaSqm: 12,
      rooms: [
        room('bedroom', {
          selections: [
            select(CATEGORY.floor, PRODUCT.floor),
            select(CATEGORY.wallPaint, PRODUCT.wallPaint),
            select(CATEGORY.ceiling, PRODUCT.ceiling),
            select(CATEGORY.skirting, PRODUCT.skirting),
          ],
        }),
      ],
    });
    const result = run(configuration, scopeData);
    const floor = lineOf(result, floorLineId('bedroom'));
    expect(floor?.components).toEqual([
      {
        kind: 'MATERIAL',
        ruleId: RULE.floor,
        amountCents: floorArea * (PRICE_CENTS.floor + 200),
      },
    ]);
    const materials = sectionOf(result, 'MATERIALS');
    expect(materials).toHaveLength(4);
    for (const line of materials) {
      expect(line.status).toBe('OK');
      expect(line.components?.map((component) => component.kind)).toEqual([
        'MATERIAL',
      ]);
      expect(line.warnings).toEqual([]);
    }
    const failing = {
      ...scopeData,
      rules: scopeData.rules.map((rule) =>
        rule.level === 'SURFACE'
          ? { ...rule, costFormula: '1 / 0' }
          : rule.level === 'CATEGORY'
            ? { ...rule, laborFormula: '1 / 0' }
            : rule,
      ),
    };
    expect(run(configuration, failing)).toEqual(result);
    expect(result.incomplete).toBe(false);
  });

  it('E11 FULL warns when rooms cover less than the total by more than the threshold', () => {
    const missingSqm = 60 - 45;
    const rooms = (lengthM: number, widthM: number) => [
      room('a', { lengthM, widthM }),
    ];
    const below = run(
      fullConfiguration({ totalAreaSqm: 60, rooms: rooms(9, 5) }),
      scopeData,
    );
    expect(below.warnings).toContainEqual({
      code: 'ROOMS_AREA_BELOW_TOTAL',
      params: { missingSqm },
    });
    const atThreshold = run(
      fullConfiguration({ totalAreaSqm: 60, rooms: rooms(11, 5) }),
      scopeData,
    );
    const withinThreshold = run(
      fullConfiguration({ totalAreaSqm: 60, rooms: rooms(8, 7) }),
      scopeData,
    );
    for (const result of [atThreshold, withinThreshold]) {
      expect(result.warnings.map((warning) => warning.code)).not.toContain(
        'ROOMS_AREA_BELOW_TOTAL',
      );
    }
  });

  it('E12 PARTIAL never raises ROOMS_AREA warnings', () => {
    const result = run(
      partialConfiguration({
        rooms: [room('big', { lengthM: 30, widthM: 30 })],
        balconyAreaSqm: 4,
      }),
      scopeData,
    );
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes.filter((code) => code.startsWith('ROOMS_AREA_'))).toEqual([]);
    const full = run(
      fullConfiguration({
        totalAreaSqm: 10,
        rooms: [room('big', { lengthM: 30, widthM: 30 })],
      }),
      scopeData,
    );
    expect(full.warnings.map((warning) => warning.code)).toContain(
      'ROOMS_AREA_EXCEEDS_TOTAL',
    );
  });

  it('E13 option priced by coefficients follows them together with BASE electrics', () => {
    const roomsFloorArea = 12;
    const electricsPerSqmCents = 920 + 1100;
    const bumpedElectricsPerSqmCents = electricsPerSqmCents + 100;
    const bumped = {
      ...scopeData,
      coefficients: {
        ...scopeData.coefficients,
        eng_electrics_sqm: 10.2,
      },
    };
    const rooms = [room('bedroom')];
    const optionConfiguration = partialConfiguration({
      rooms,
      options: [{ optionId: OPTION.electrics, roomClientIds: ['bedroom'] }],
    });
    const optionLine = (data: typeof scopeData) =>
      sectionOf(run(optionConfiguration, data), 'ENGINEERING').find(
        (line) => line.optionId === OPTION.electrics,
      );
    expect(optionLine(scopeData)).toMatchObject({
      status: 'OK',
      unitPriceCents: electricsPerSqmCents,
      amountCents: roomsFloorArea * electricsPerSqmCents,
    });
    expect(optionLine(bumped)).toMatchObject({
      status: 'OK',
      unitPriceCents: bumpedElectricsPerSqmCents,
      amountCents: roomsFloorArea * bumpedElectricsPerSqmCents,
    });

    const baseElectrics = (data: typeof scopeData) =>
      sectionOf(
        run(
          fullConfiguration({ finishLevel: 'ROUGH', totalAreaSqm: 12, rooms }),
          data,
        ),
        'BASE',
      ).find((line) => line.ruleId === RULE.baseElectrics);
    expect(baseElectrics(scopeData)?.amountCents).toBe(
      roomsFloorArea * electricsPerSqmCents,
    );
    expect(baseElectrics(bumped)?.amountCents).toBe(
      roomsFloorArea * bumpedElectricsPerSqmCents,
    );
  });

  it('E14 option limited to PARTIAL is unavailable in FULL', () => {
    const rooms = [room('bedroom')];
    const options = [
      { optionId: OPTION.extra },
      { optionId: OPTION.electrics, roomClientIds: ['bedroom'] },
    ];
    const full = run(
      fullConfiguration({ totalAreaSqm: 12, rooms, options }),
      scopeData,
    );
    for (const optionId of [OPTION.extra, OPTION.electrics]) {
      const line = full.lines.find((item) => item.optionId === optionId);
      expect(line?.status).toBe('UNAVAILABLE');
      expect(line?.error?.code).toBe('OPTION_SCOPE_NOT_ALLOWED');
      expect(line?.amountCents).toBe(0);
    }
    const partial = run(partialConfiguration({ rooms, options }), scopeData);
    const extra = partial.lines.find((item) => item.optionId === OPTION.extra);
    expect(extra?.status).toBe('OK');
    expect(extra?.amountCents).toBe(PRICE_CENTS.extraOption);
  });

  it('E16 PARTIAL balcony tile is area times material plus labor', () => {
    const balconyAreaSqm = 6;
    const partialLine = sectionOf(
      run(
        partialConfiguration({
          balconyAreaSqm,
          balconyTiles: true,
          rooms: [room('bedroom')],
        }),
        scopeData,
      ),
      'OBJECT',
    ).find((line) => line.ruleId === RULE.balconyTile);
    expect(partialLine?.status).toBe('OK');
    expect(partialLine?.amountCents).toBe(balconyAreaSqm * (7500 + 1860));
    const fullLine = sectionOf(
      run(
        fullConfiguration({
          balconyAreaSqm,
          balconyTiles: true,
          rooms: [room('bedroom')],
        }),
        scopeData,
      ),
      'OBJECT',
    ).find((line) => line.ruleId === RULE.balconyTile);
    expect(fullLine?.amountCents).toBe(balconyAreaSqm * 7500);
  });
});
