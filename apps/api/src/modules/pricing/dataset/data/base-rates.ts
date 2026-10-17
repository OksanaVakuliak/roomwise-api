import { FinishLevel } from '../../../../generated/prisma/enums';
import type { SeedBaseRate } from '../pricing-dataset.schema';

const RANGES = [
  { areaFromSqm: 15, areaToSqm: 30, rough: 9500, preFinish: 14500 },
  { areaFromSqm: 30, areaToSqm: 45, rough: 9000, preFinish: 13800 },
  { areaFromSqm: 45, areaToSqm: 55, rough: 8500, preFinish: 13000 },
  { areaFromSqm: 55, areaToSqm: 70, rough: 8000, preFinish: 12200 },
  { areaFromSqm: 70, areaToSqm: 90, rough: 7500, preFinish: 11500 },
  { areaFromSqm: 90, areaToSqm: 120, rough: 7000, preFinish: 10800 },
  { areaFromSqm: 120, areaToSqm: 160, rough: 6500, preFinish: 10000 },
  { areaFromSqm: 160, areaToSqm: 220, rough: 6000, preFinish: 9300 },
  { areaFromSqm: 220, areaToSqm: 300, rough: 5600, preFinish: 8600 },
  { areaFromSqm: 300, areaToSqm: 400, rough: 5200, preFinish: 8000 },
  { areaFromSqm: 400, areaToSqm: 500.01, rough: 4800, preFinish: 7400 },
];

export const baseRates: SeedBaseRate[] = RANGES.flatMap((range) => [
  {
    finishLevel: FinishLevel.ROUGH,
    areaFromSqm: range.areaFromSqm,
    areaToSqm: range.areaToSqm,
    rateCentsPerSqm: range.rough,
  },
  {
    finishLevel: FinishLevel.PRE_FINISH,
    areaFromSqm: range.areaFromSqm,
    areaToSqm: range.areaToSqm,
    rateCentsPerSqm: range.preFinish,
  },
]);
