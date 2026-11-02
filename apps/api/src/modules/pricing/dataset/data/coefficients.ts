import { CoefficientGroup } from '../../../../generated/prisma/enums';
import type { SeedCoefficient } from '../pricing-dataset.schema';

const PER_SQM = { en: '$ per m²', uk: '$ за м²' };
const PER_LINEAR_M = { en: '$ per linear m', uk: '$ за пог. м' };
const PER_PIECE = { en: '$ per piece', uk: '$ за шт.' };

export const coefficients: SeedCoefficient[] = [
  {
    key: 'laminate_underlay',
    name: { en: 'Laminate underlay', uk: 'Підкладка під ламінат' },
    value: 2,
    unit: PER_SQM,
  },
  {
    key: 'tile_glue',
    name: { en: 'Tile glue', uk: 'Клей для плитки' },
    value: 10,
    unit: PER_SQM,
  },
  {
    key: 'tile_glue_heated',
    name: { en: 'Heated floor tile glue', uk: 'Клей для теплої підлоги' },
    value: 21,
    unit: PER_SQM,
  },
  {
    key: 'balcony_tile',
    name: { en: 'Balcony tile', uk: 'Плитка на балкон' },
    value: 75,
    unit: PER_SQM,
  },
  {
    key: 'labor_laminate',
    name: { en: 'Laminate installation labor', uk: 'Укладання ламінату' },
    value: 7,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_floor_covering',
    name: {
      en: 'Floor covering installation labor',
      uk: 'Укладання підлогового покриття',
    },
    value: 8.6,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_floor_tile',
    name: {
      en: 'Floor tile installation labor',
      uk: 'Укладання підлогової плитки',
    },
    value: 18.6,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_wall_tile',
    name: {
      en: 'Wall tile installation labor',
      uk: 'Укладання настінної плитки',
    },
    value: 19.7,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_wall_paint',
    name: { en: 'Wall painting labor', uk: 'Фарбування стін' },
    value: 3.9,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_wallpaper',
    name: { en: 'Wallpapering labor', uk: 'Поклейка шпалер' },
    value: 4.7,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_ceiling_paint',
    name: { en: 'Ceiling finishing labor', uk: 'Оздоблення стелі' },
    value: 4.2,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_skirting',
    name: { en: 'Skirting board installation labor', uk: 'Монтаж плінтусів' },
    value: 3.3,
    unit: PER_LINEAR_M,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_door',
    name: { en: 'Door installation labor', uk: 'Монтаж дверей' },
    value: 60.3,
    unit: PER_PIECE,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_light',
    name: {
      en: 'Light fixture installation labor',
      uk: 'Монтаж освітлювальних приладів',
    },
    value: 6.6,
    unit: PER_PIECE,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_plumbing_fixture',
    name: {
      en: 'Plumbing fixture installation labor',
      uk: 'Монтаж сантехніки',
    },
    value: 29,
    unit: PER_PIECE,
    group: CoefficientGroup.LABOR,
  },
  {
    key: 'labor_balcony_tile',
    name: {
      en: 'Balcony tile installation labor',
      uk: 'Укладання плитки на балконі',
    },
    value: 18.6,
    unit: PER_SQM,
    group: CoefficientGroup.LABOR,
  },
];
