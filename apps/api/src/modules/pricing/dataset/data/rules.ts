import { RuleLevel } from '../../../../generated/prisma/enums';
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
} as const;

const FLOOR_QUANTITY = 'floorArea * (1 + waste)';
const WALL_QUANTITY = 'wallArea * (1 + waste)';
const LINEAR_QUANTITY = 'perimeter * (1 + waste)';
const PIECE_QUANTITY = '1';
const PRICE_COST = 'quantity * price';
const FLOOR_TILE_COST =
  'quantity * (price + (heatedFloor ? coef.tile_glue_heated : coef.tile_glue))';
const WALL_TILE_COST = 'quantity * (price + coef.tile_glue)';

type RuleName = SeedPricingRule['name'];

function categoryRule(
  id: string,
  categoryId: string,
  name: RuleName,
  quantityFormula: string,
): SeedPricingRule {
  return {
    id,
    level: RuleLevel.CATEGORY,
    categoryId,
    materialTypeId: null,
    name,
    quantityFormula,
    costFormula: PRICE_COST,
    coefficientKeys: [],
    sortOrder: 0,
  };
}

function materialTypeRule(
  id: string,
  categoryId: string,
  materialTypeId: string,
  name: RuleName,
  quantityFormula: string,
  costFormula: string,
  coefficientKeys: string[],
): SeedPricingRule {
  return {
    id,
    level: RuleLevel.MATERIAL_TYPE,
    categoryId,
    materialTypeId,
    name,
    quantityFormula,
    costFormula,
    coefficientKeys,
    sortOrder: 0,
  };
}

export const rules: SeedPricingRule[] = [
  categoryRule(
    ruleIds.floorCovering,
    categoryIds.floorCovering,
    { en: 'Floor covering', uk: 'Підлогове покриття' },
    FLOOR_QUANTITY,
  ),
  categoryRule(
    ruleIds.wallPaint,
    categoryIds.wallPaint,
    { en: 'Wall paint', uk: 'Фарба для стін' },
    WALL_QUANTITY,
  ),
  categoryRule(
    ruleIds.wallpaper,
    categoryIds.wallpaper,
    { en: 'Wallpaper', uk: 'Шпалери' },
    WALL_QUANTITY,
  ),
  categoryRule(
    ruleIds.wallTile,
    categoryIds.wallTile,
    { en: 'Wall tile', uk: 'Настінна плитка' },
    WALL_QUANTITY,
  ),
  categoryRule(
    ruleIds.floorTile,
    categoryIds.floorTile,
    { en: 'Floor tile', uk: 'Підлогова плитка' },
    FLOOR_QUANTITY,
  ),
  categoryRule(
    ruleIds.ceilingFinish,
    categoryIds.ceilingFinish,
    { en: 'Ceiling finish', uk: 'Оздоблення стелі' },
    FLOOR_QUANTITY,
  ),
  categoryRule(
    ruleIds.skirtingBoards,
    categoryIds.skirtingBoards,
    { en: 'Skirting boards', uk: 'Плінтуси' },
    LINEAR_QUANTITY,
  ),
  categoryRule(
    ruleIds.doors,
    categoryIds.doors,
    { en: 'Doors', uk: 'Двері' },
    PIECE_QUANTITY,
  ),
  categoryRule(
    ruleIds.lighting,
    categoryIds.lighting,
    { en: 'Lighting fixtures', uk: 'Освітлювальні прилади' },
    PIECE_QUANTITY,
  ),
  categoryRule(
    ruleIds.plumbingFixtures,
    categoryIds.plumbingFixtures,
    { en: 'Plumbing fixtures', uk: 'Сантехніка' },
    PIECE_QUANTITY,
  ),
  materialTypeRule(
    ruleIds.laminateFloor,
    categoryIds.floorCovering,
    materialTypeIds.laminate,
    { en: 'Laminate with underlay', uk: 'Ламінат з підкладкою' },
    FLOOR_QUANTITY,
    'quantity * (price + coef.laminate_underlay)',
    ['laminate_underlay'],
  ),
  materialTypeRule(
    ruleIds.ceramicFloorTile,
    categoryIds.floorTile,
    materialTypeIds.ceramicTile,
    {
      en: 'Ceramic floor tile with glue',
      uk: 'Керамічна підлогова плитка з клеєм',
    },
    FLOOR_QUANTITY,
    FLOOR_TILE_COST,
    ['tile_glue', 'tile_glue_heated'],
  ),
  materialTypeRule(
    ruleIds.porcelainFloorTile,
    categoryIds.floorTile,
    materialTypeIds.porcelainStoneware,
    {
      en: 'Porcelain floor tile with glue',
      uk: 'Керамограніт на підлозі з клеєм',
    },
    FLOOR_QUANTITY,
    FLOOR_TILE_COST,
    ['tile_glue', 'tile_glue_heated'],
  ),
  materialTypeRule(
    ruleIds.ceramicWallTile,
    categoryIds.wallTile,
    materialTypeIds.ceramicTile,
    {
      en: 'Ceramic wall tile with glue',
      uk: 'Керамічна настінна плитка з клеєм',
    },
    WALL_QUANTITY,
    WALL_TILE_COST,
    ['tile_glue'],
  ),
  materialTypeRule(
    ruleIds.porcelainWallTile,
    categoryIds.wallTile,
    materialTypeIds.porcelainStoneware,
    {
      en: 'Porcelain wall tile with glue',
      uk: 'Керамограніт на стінах з клеєм',
    },
    WALL_QUANTITY,
    WALL_TILE_COST,
    ['tile_glue'],
  ),
  {
    id: ruleIds.balconyTile,
    level: RuleLevel.OBJECT,
    categoryId: null,
    materialTypeId: null,
    name: { en: 'Balcony tile', uk: 'Плитка на балконі' },
    quantityFormula: null,
    costFormula: 'balconyTiles ? balconyArea * coef.balcony_tile : 0',
    coefficientKeys: ['balcony_tile'],
    sortOrder: 0,
  },
];
