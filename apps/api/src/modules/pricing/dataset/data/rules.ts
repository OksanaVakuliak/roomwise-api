import type { RuleSurface } from '../../../../common/pricing/rule-surface.schema';
import { RuleLevel, SurfaceKind } from '../../../../generated/prisma/enums';
import { categoryIds } from '../../../catalog/dataset/data/categories';
import { materialTypeIds } from '../../../catalog/dataset/data/material-types';
import type { SeedPricingRule } from '../pricing-dataset.schema';

export const ruleIds = {
  floorCovering: '50b580ae-9a1f-49f4-990f-a28bece9d65b',
  wallPaint: 'e0293aaf-0879-4e76-950f-847b637cbc83',
  wallpaper: '1c33d619-d098-449c-a19b-1c0215c1c74b',
  wallTile: 'f2fffa37-4412-4be5-ae34-db43f2b95292',
  floorTile: '14ed27ec-0323-456d-ab84-7433d9ac7cdc',
  ceilingFinish: '92bc8f9b-4a61-4e37-b959-36bfe64c5095',
  skirtingBoards: '81a0886e-9c7c-4832-b367-1297dcafdce4',
  doors: '499f300d-01e2-4709-9f69-d80c2ceffda6',
  lighting: '92e68dee-d63a-4ca1-857f-00a8613dd198',
  plumbingFixtures: 'b2b64869-56fa-40de-925f-40019691047b',
  laminateFloor: '581fc0d3-70ea-48ae-9b31-d6098ab8cb39',
  ceramicFloorTile: 'dcfe8a6e-5545-44ae-9a0a-d2ab66f9d16a',
  porcelainFloorTile: 'ff329d4e-abf2-4668-8116-1d01a98802b3',
  ceramicWallTile: '3a23d981-4c27-4b05-b923-f70803d6de69',
  porcelainWallTile: 'df264c3d-3c7e-4a14-abe8-d1b80fc88179',
  balconyTile: '69d9411d-6fd7-4f6b-8ce9-6f68f90b24fc',
  floorPreparation: '7d169fa7-0185-4d9c-95d5-365f208e3d05',
  wallsPreparation: '50d251ec-283f-405c-aca7-66830717a59e',
  ceilingPreparation: '7dad9890-5133-476d-a947-f25032d5aa73',
  baseDemolition: '5eff5f82-1835-485b-a33f-e111767695e6',
  baseScreed: 'a6b36d7e-1480-41e3-be5a-a0589e646ad9',
  baseWallPlaster: 'e692319d-1f6a-4761-9a11-b82c62b17b68',
  baseCeilingPlaster: 'a4a6ce11-85f2-41a0-ad63-835864ea8066',
  baseWallPutty: 'fbe0d7f6-3a7c-460f-81c6-77ecbf943439',
  baseCeilingPutty: 'b65a4860-0e1f-4240-a193-cdfe0bcdeeb8',
  baseElectrics: 'be2b60bb-ee77-4ecb-b601-bda03ba113f9',
  basePlumbing: '57b0648d-05d1-47f0-a180-6b088bdb2720',
} as const;

type Measure = { quantity: string; laborBase: string };

const FLOOR_MEASURE: Measure = {
  quantity: 'floorArea * (1 + waste)',
  laborBase: 'floorArea',
};
const WALL_MEASURE: Measure = {
  quantity: 'wallArea * (1 + waste)',
  laborBase: 'wallArea',
};
const LINEAR_MEASURE: Measure = {
  quantity: 'perimeter * (1 + waste)',
  laborBase: 'perimeter',
};
const PIECE_MEASURE: Measure = { quantity: '1', laborBase: 'quantity' };
const PRICE_COST = 'quantity * price';
const FLOOR_TILE_COST =
  'quantity * (price + (heatedFloor ? coef.tile_glue_heated : coef.tile_glue))';
const WALL_TILE_COST = 'quantity * (price + coef.tile_glue)';
const BALCONY_TILE_COST =
  "balconyTiles ? balconyArea * (coef.balcony_tile + (scope == 'PARTIAL' ? coef.labor_balcony_tile : 0)) : 0";

const FLOOR_PREPARATION_COST =
  "surfaceArea * (finishLevel == 'ROUGH' ? coef.prep_screed + coef.mat_screed : finishLevel == 'LIVED_IN' ? coef.prep_floor_demolition + coef.mat_demolition_disposal : 0)";

function plasterAndPutty(surface: 'wall' | 'ceiling'): string {
  const plaster = `coef.prep_${surface}_plaster + coef.mat_${surface}_plaster`;
  const putty = `coef.prep_${surface}_putty + coef.mat_putty`;
  const stripping = `coef.prep_${surface}_stripping`;
  return `surfaceArea * (finishLevel == 'ROUGH' ? ${plaster} + ${putty} : finishLevel == 'LIVED_IN' ? ${stripping} + ${putty} : ${putty})`;
}

function laborFormula(measure: Measure, key: string): string {
  return `${measure.laborBase} * coef.${key}`;
}

type RuleName = SeedPricingRule['name'];

function categoryRule(
  id: string,
  categoryId: string,
  name: RuleName,
  measure: Measure,
  laborKey: string,
): SeedPricingRule {
  return {
    id,
    level: RuleLevel.CATEGORY,
    categoryId,
    materialTypeId: null,
    name,
    quantityFormula: measure.quantity,
    costFormula: PRICE_COST,
    laborFormula: laborFormula(measure, laborKey),
    coefficientKeys: [laborKey],
    sortOrder: 0,
  };
}

function materialTypeRule(
  id: string,
  categoryId: string,
  materialTypeId: string,
  name: RuleName,
  measure: Measure,
  costFormula: string,
  coefficientKeys: string[],
  laborKey: string,
): SeedPricingRule {
  return {
    id,
    level: RuleLevel.MATERIAL_TYPE,
    categoryId,
    materialTypeId,
    name,
    quantityFormula: measure.quantity,
    costFormula,
    laborFormula: laborFormula(measure, laborKey),
    coefficientKeys: [...coefficientKeys, laborKey],
    sortOrder: 0,
  };
}

function surfaceRule(
  id: string,
  surface: RuleSurface,
  name: RuleName,
  costFormula: string,
  coefficientKeys: string[],
): SeedPricingRule {
  return {
    id,
    level: RuleLevel.SURFACE,
    categoryId: null,
    materialTypeId: null,
    surface,
    name,
    quantityFormula: null,
    costFormula,
    coefficientKeys,
    sortOrder: 0,
  };
}

function baseRule(
  id: string,
  name: RuleName,
  costFormula: string,
  coefficientKeys: string[],
): SeedPricingRule {
  return {
    id,
    level: RuleLevel.OBJECT,
    categoryId: null,
    materialTypeId: null,
    baseComponent: true,
    name,
    quantityFormula: null,
    costFormula,
    coefficientKeys,
    sortOrder: 0,
  };
}

const baseRules: SeedPricingRule[] = [
  baseRule(
    ruleIds.baseDemolition,
    { en: 'Covering demolition', uk: 'Демонтаж покриттів' },
    "finishLevel == 'LIVED_IN' ? roomsFloorArea * (coef.prep_floor_demolition + coef.mat_demolition_disposal) + roomsWallArea * coef.prep_wall_stripping : 0",
    ['prep_floor_demolition', 'mat_demolition_disposal', 'prep_wall_stripping'],
  ),
  baseRule(
    ruleIds.baseScreed,
    { en: 'Screed', uk: 'Стяжка' },
    "finishLevel == 'ROUGH' ? roomsFloorArea * (coef.prep_screed + coef.mat_screed) : 0",
    ['prep_screed', 'mat_screed'],
  ),
  baseRule(
    ruleIds.baseWallPlaster,
    { en: 'Wall plastering', uk: 'Штукатурка стін' },
    "roomsWallArea * (coef.prep_wall_plaster + coef.mat_wall_plaster) * (finishLevel == 'ROUGH' ? 1 : finishLevel == 'LIVED_IN' ? coef.lived_in_levelling_share : 0)",
    ['prep_wall_plaster', 'mat_wall_plaster', 'lived_in_levelling_share'],
  ),
  baseRule(
    ruleIds.baseCeilingPlaster,
    { en: 'Ceiling plastering', uk: 'Штукатурка стелі' },
    "finishLevel == 'ROUGH' ? roomsFloorArea * (coef.prep_ceiling_plaster + coef.mat_ceiling_plaster) : 0",
    ['prep_ceiling_plaster', 'mat_ceiling_plaster'],
  ),
  baseRule(
    ruleIds.baseWallPutty,
    { en: 'Wall puttying', uk: 'Шпаклівка стін' },
    'roomsWallArea * (coef.prep_wall_putty + coef.mat_putty)',
    ['prep_wall_putty', 'mat_putty'],
  ),
  baseRule(
    ruleIds.baseCeilingPutty,
    { en: 'Ceiling puttying', uk: 'Шпаклівка стелі' },
    'roomsFloorArea * (coef.prep_ceiling_putty + coef.mat_putty)',
    ['prep_ceiling_putty', 'mat_putty'],
  ),
  baseRule(
    ruleIds.baseElectrics,
    { en: 'Wiring', uk: 'Електрика' },
    "finishLevel == 'PRE_FINISH' ? 0 : roomsFloorArea * (coef.eng_electrics_sqm + coef.mat_electrics_sqm)",
    ['eng_electrics_sqm', 'mat_electrics_sqm'],
  ),
  baseRule(
    ruleIds.basePlumbing,
    { en: 'Water supply and sewerage', uk: 'Вода й каналізація' },
    "finishLevel == 'PRE_FINISH' ? 0 : wetRoomsCount * (coef.eng_plumbing_room + coef.mat_plumbing_room)",
    ['eng_plumbing_room', 'mat_plumbing_room'],
  ),
].map((rule, index) => ({ ...rule, sortOrder: index + 1 }));

export const rules: SeedPricingRule[] = [
  categoryRule(
    ruleIds.floorCovering,
    categoryIds.floorCovering,
    { en: 'Floor covering', uk: 'Підлогове покриття' },
    FLOOR_MEASURE,
    'labor_floor_covering',
  ),
  categoryRule(
    ruleIds.wallPaint,
    categoryIds.wallPaint,
    { en: 'Wall paint', uk: 'Фарба для стін' },
    WALL_MEASURE,
    'labor_wall_paint',
  ),
  categoryRule(
    ruleIds.wallpaper,
    categoryIds.wallpaper,
    { en: 'Wallpaper', uk: 'Шпалери' },
    WALL_MEASURE,
    'labor_wallpaper',
  ),
  categoryRule(
    ruleIds.wallTile,
    categoryIds.wallTile,
    { en: 'Wall tile', uk: 'Настінна плитка' },
    WALL_MEASURE,
    'labor_wall_tile',
  ),
  categoryRule(
    ruleIds.floorTile,
    categoryIds.floorTile,
    { en: 'Floor tile', uk: 'Підлогова плитка' },
    FLOOR_MEASURE,
    'labor_floor_tile',
  ),
  categoryRule(
    ruleIds.ceilingFinish,
    categoryIds.ceilingFinish,
    { en: 'Ceiling finish', uk: 'Оздоблення стелі' },
    FLOOR_MEASURE,
    'labor_ceiling_paint',
  ),
  categoryRule(
    ruleIds.skirtingBoards,
    categoryIds.skirtingBoards,
    { en: 'Skirting boards', uk: 'Плінтуси' },
    LINEAR_MEASURE,
    'labor_skirting',
  ),
  categoryRule(
    ruleIds.doors,
    categoryIds.doors,
    { en: 'Doors', uk: 'Двері' },
    PIECE_MEASURE,
    'labor_door',
  ),
  categoryRule(
    ruleIds.lighting,
    categoryIds.lighting,
    { en: 'Lighting fixtures', uk: 'Освітлювальні прилади' },
    PIECE_MEASURE,
    'labor_light',
  ),
  categoryRule(
    ruleIds.plumbingFixtures,
    categoryIds.plumbingFixtures,
    { en: 'Plumbing fixtures', uk: 'Сантехніка' },
    PIECE_MEASURE,
    'labor_plumbing_fixture',
  ),
  materialTypeRule(
    ruleIds.laminateFloor,
    categoryIds.floorCovering,
    materialTypeIds.laminate,
    { en: 'Laminate with underlay', uk: 'Ламінат з підкладкою' },
    FLOOR_MEASURE,
    'quantity * (price + coef.laminate_underlay)',
    ['laminate_underlay'],
    'labor_laminate',
  ),
  materialTypeRule(
    ruleIds.ceramicFloorTile,
    categoryIds.floorTile,
    materialTypeIds.ceramicTile,
    {
      en: 'Ceramic floor tile with glue',
      uk: 'Керамічна підлогова плитка з клеєм',
    },
    FLOOR_MEASURE,
    FLOOR_TILE_COST,
    ['tile_glue', 'tile_glue_heated'],
    'labor_floor_tile',
  ),
  materialTypeRule(
    ruleIds.porcelainFloorTile,
    categoryIds.floorTile,
    materialTypeIds.porcelainStoneware,
    {
      en: 'Porcelain floor tile with glue',
      uk: 'Керамограніт на підлозі з клеєм',
    },
    FLOOR_MEASURE,
    FLOOR_TILE_COST,
    ['tile_glue', 'tile_glue_heated'],
    'labor_floor_tile',
  ),
  materialTypeRule(
    ruleIds.ceramicWallTile,
    categoryIds.wallTile,
    materialTypeIds.ceramicTile,
    {
      en: 'Ceramic wall tile with glue',
      uk: 'Керамічна настінна плитка з клеєм',
    },
    WALL_MEASURE,
    WALL_TILE_COST,
    ['tile_glue'],
    'labor_wall_tile',
  ),
  materialTypeRule(
    ruleIds.porcelainWallTile,
    categoryIds.wallTile,
    materialTypeIds.porcelainStoneware,
    {
      en: 'Porcelain wall tile with glue',
      uk: 'Керамограніт на стінах з клеєм',
    },
    WALL_MEASURE,
    WALL_TILE_COST,
    ['tile_glue'],
    'labor_wall_tile',
  ),
  {
    id: ruleIds.balconyTile,
    level: RuleLevel.OBJECT,
    categoryId: null,
    materialTypeId: null,
    name: { en: 'Balcony tile', uk: 'Плитка на балконі' },
    quantityFormula: null,
    costFormula: BALCONY_TILE_COST,
    coefficientKeys: ['balcony_tile', 'labor_balcony_tile'],
    sortOrder: 0,
  },
  surfaceRule(
    ruleIds.floorPreparation,
    SurfaceKind.FLOOR,
    { en: 'Floor preparation', uk: 'Підготовка підлоги' },
    FLOOR_PREPARATION_COST,
    [
      'prep_screed',
      'mat_screed',
      'prep_floor_demolition',
      'mat_demolition_disposal',
    ],
  ),
  surfaceRule(
    ruleIds.wallsPreparation,
    SurfaceKind.WALLS,
    { en: 'Wall preparation', uk: 'Підготовка стін' },
    plasterAndPutty('wall'),
    [
      'prep_wall_plaster',
      'mat_wall_plaster',
      'prep_wall_putty',
      'mat_putty',
      'prep_wall_stripping',
    ],
  ),
  surfaceRule(
    ruleIds.ceilingPreparation,
    SurfaceKind.CEILING,
    { en: 'Ceiling preparation', uk: 'Підготовка стелі' },
    plasterAndPutty('ceiling'),
    [
      'prep_ceiling_plaster',
      'mat_ceiling_plaster',
      'prep_ceiling_putty',
      'mat_putty',
      'prep_ceiling_stripping',
    ],
  ),
  ...baseRules,
];
