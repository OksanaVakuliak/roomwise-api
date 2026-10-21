import type { SeedCoefficient } from '../pricing-dataset.schema';

const PER_SQM = { en: '$ per m²', uk: '$ за м²' };

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
];
