import { CoefficientGroup } from '../../../../generated/prisma/enums';
import type { SeedCoefficient } from '../pricing-dataset.schema';

const PER_SQM = { en: '$ per m²', uk: '$ за м²' };
const PER_LINEAR_M = { en: '$ per linear m', uk: '$ за пог. м' };
const PER_PIECE = { en: '$ per piece', uk: '$ за шт.' };
const PER_ROOM_SQM = { en: '$ per m² of room', uk: '$ за м² приміщення' };
const PER_WET_ROOM = { en: '$ per wet room', uk: '$ за мокре приміщення' };
const SHARE = { en: 'share', uk: 'частка' };

export const coefficients: SeedCoefficient[] = [
  {
    key: 'laminate_underlay',
    name: { en: 'Laminate underlay', uk: 'Підкладка під ламінат' },
    value: 2,
    unit: PER_SQM,
    group: CoefficientGroup.MATERIAL_EXTRA,
  },
  {
    key: 'tile_glue',
    name: { en: 'Tile glue', uk: 'Клей для плитки' },
    value: 10,
    unit: PER_SQM,
    group: CoefficientGroup.MATERIAL_EXTRA,
  },
  {
    key: 'tile_glue_heated',
    name: { en: 'Heated floor tile glue', uk: 'Клей для теплої підлоги' },
    value: 21,
    unit: PER_SQM,
    group: CoefficientGroup.MATERIAL_EXTRA,
  },
  {
    key: 'balcony_tile',
    name: { en: 'Balcony tile', uk: 'Плитка на балкон' },
    value: 75,
    unit: PER_SQM,
    group: CoefficientGroup.MATERIAL_EXTRA,
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
  {
    key: 'prep_screed',
    name: { en: 'Screed labor', uk: 'Влаштування стяжки' },
    value: 8.3,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_floor_demolition',
    name: {
      en: 'Floor covering demolition labor',
      uk: 'Демонтаж підлогового покриття',
    },
    value: 3.5,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_wall_plaster',
    name: { en: 'Wall plastering labor', uk: 'Штукатурення стін' },
    value: 7.9,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_wall_putty',
    name: { en: 'Wall puttying labor', uk: 'Шпаклювання стін' },
    value: 8.1,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_wall_stripping',
    name: {
      en: 'Wall stripping labor',
      uk: 'Зняття старого оздоблення зі стін',
    },
    value: 3.2,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_ceiling_plaster',
    name: { en: 'Ceiling plastering labor', uk: 'Штукатурення стелі' },
    value: 9.9,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_ceiling_putty',
    name: { en: 'Ceiling puttying labor', uk: 'Шпаклювання стелі' },
    value: 9.2,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'prep_ceiling_stripping',
    name: {
      en: 'Ceiling stripping labor',
      uk: 'Зняття старого оздоблення зі стелі',
    },
    value: 3.2,
    unit: PER_SQM,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'lived_in_levelling_share',
    name: {
      en: 'Wall levelling share in a lived-in flat',
      uk: 'Частка вирівнювання стін у житловому стані',
    },
    value: 0.3,
    unit: SHARE,
    group: CoefficientGroup.PREPARATION,
  },
  {
    key: 'mat_screed',
    name: { en: 'Screed materials', uk: 'Матеріали для стяжки' },
    value: 14.8,
    unit: PER_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'mat_wall_plaster',
    name: { en: 'Wall plaster materials', uk: 'Матеріали для штукатурки стін' },
    value: 5,
    unit: PER_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'mat_ceiling_plaster',
    name: {
      en: 'Ceiling plaster materials',
      uk: 'Матеріали для штукатурки стелі',
    },
    value: 3.5,
    unit: PER_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'mat_putty',
    name: { en: 'Putty materials', uk: 'Матеріали для шпаклівки' },
    value: 1.6,
    unit: PER_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'mat_demolition_disposal',
    name: {
      en: 'Demolition debris disposal',
      uk: 'Вивіз будівельного сміття після демонтажу',
    },
    value: 2.8,
    unit: PER_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'mat_stripping_disposal',
    name: {
      en: 'Debris disposal after stripping finishes',
      uk: 'Вивіз сміття після зняття оздоблення стін і стелі',
    },
    value: 0.4,
    unit: PER_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'eng_electrics_sqm',
    name: { en: 'Wiring replacement labor', uk: 'Заміна електрики, робота' },
    value: 9.2,
    unit: PER_ROOM_SQM,
    group: CoefficientGroup.ENGINEERING,
  },
  {
    key: 'mat_electrics_sqm',
    name: {
      en: 'Wiring replacement materials',
      uk: 'Заміна електрики, матеріали',
    },
    value: 11,
    unit: PER_ROOM_SQM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
  {
    key: 'eng_plumbing_room',
    name: { en: 'Pipe replacement labor', uk: 'Заміна труб, робота' },
    value: 113,
    unit: PER_WET_ROOM,
    group: CoefficientGroup.ENGINEERING,
  },
  {
    key: 'mat_plumbing_room',
    name: { en: 'Pipe replacement materials', uk: 'Заміна труб, матеріали' },
    value: 56,
    unit: PER_WET_ROOM,
    group: CoefficientGroup.ROUGH_MATERIAL,
  },
];
