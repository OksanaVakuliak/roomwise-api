import type {
  Configuration,
  PricingData,
  PricingOption,
  PricingRule,
  RoomConfiguration,
} from '../../src';

export const RULE = {
  baseScreed: '00000000-0000-4000-8000-000000000001',
  basePlaster: '00000000-0000-4000-8000-000000000002',
  baseElectrics: '00000000-0000-4000-8000-000000000003',
  basePlumbing: '00000000-0000-4000-8000-000000000004',
  baseDemolition: '00000000-0000-4000-8000-000000000005',
  baseCleaning: '00000000-0000-4000-8000-000000000006',
  balconyTile: '00000000-0000-4000-8000-000000000007',
  surfaceFloor: '00000000-0000-4000-8000-000000000011',
  surfaceWalls: '00000000-0000-4000-8000-000000000012',
  surfaceCeiling: '00000000-0000-4000-8000-000000000013',
  floor: '00000000-0000-4000-8000-000000000021',
  wallPaint: '00000000-0000-4000-8000-000000000022',
  wallTile: '00000000-0000-4000-8000-000000000023',
  ceiling: '00000000-0000-4000-8000-000000000024',
  skirting: '00000000-0000-4000-8000-000000000025',
} as const;

export const CATEGORY = {
  floor: 'cat-floor',
  wallPaint: 'cat-wall-paint',
  wallTile: 'cat-wall-tile',
  ceiling: 'cat-ceiling',
  skirting: 'cat-skirting',
} as const;

export const PRODUCT = {
  floor: 'p-laminate',
  wallPaint: 'p-paint',
  wallTile: 'p-wall-tile',
  ceiling: 'p-ceiling-paint',
  skirting: 'p-skirting',
} as const;

export const OPTION = {
  electrics: 'opt-electrics',
  extra: 'opt-extra',
} as const;

export const PACKAGE_ITEM = {
  included: 'pkg-included',
  charged: 'pkg-charged',
} as const;

export const PRICE_CENTS = {
  floor: 2000,
  wallPaint: 1000,
  wallTile: 3000,
  ceiling: 600,
  skirting: 400,
  extraOption: 15000,
  chargedPackageItem: 5000,
} as const;

export const COEFFICIENTS: Readonly<Record<string, number>> = {
  prep_screed: 8.3,
  mat_screed: 14.8,
  prep_wall_plaster: 7.9,
  mat_wall_plaster: 5,
  prep_wall_putty: 8.1,
  mat_putty: 1.6,
  prep_ceiling_plaster: 9.9,
  mat_ceiling_plaster: 3.5,
  prep_ceiling_putty: 9.2,
  prep_floor_demolition: 3.5,
  mat_demolition_disposal: 2.8,
  prep_cleaning: 1.2,
  eng_electrics_sqm: 9.2,
  mat_electrics_sqm: 11,
  eng_plumbing_room: 113,
  mat_plumbing_room: 56,
  labor_laminate: 7,
  labor_wall_paint: 3.9,
  labor_wall_tile: 19.7,
  labor_ceiling_paint: 4.2,
  labor_balcony_tile: 18.6,
  laminate_underlay: 2,
  tile_glue: 10,
  balcony_tile: 75,
};

const RULE_NAME = { en: 'Rule', uk: 'Правило' };

const objectRule = (
  id: string,
  sortOrder: number,
  costFormula: string,
  baseComponent: boolean,
): PricingRule => ({
  id,
  level: 'OBJECT',
  categoryId: null,
  materialTypeId: null,
  name: RULE_NAME,
  quantityFormula: null,
  surface: null,
  baseComponent,
  costFormula,
  laborFormula: null,
  sortOrder,
});

const surfaceRule = (
  id: string,
  surface: 'FLOOR' | 'WALLS' | 'CEILING',
  costFormula: string,
): PricingRule => ({
  id,
  level: 'SURFACE',
  categoryId: null,
  materialTypeId: null,
  name: RULE_NAME,
  quantityFormula: null,
  surface,
  baseComponent: false,
  costFormula,
  laborFormula: null,
  sortOrder: 0,
});

const categoryRule = (
  id: string,
  categoryId: string,
  quantityFormula: string,
  costFormula: string,
  laborFormula: string | null,
): PricingRule => ({
  id,
  level: 'CATEGORY',
  categoryId,
  materialTypeId: null,
  name: RULE_NAME,
  quantityFormula,
  surface: null,
  baseComponent: false,
  costFormula,
  laborFormula,
  sortOrder: 0,
});

const rules: PricingRule[] = [
  objectRule(
    RULE.baseScreed,
    10,
    "finishLevel == 'ROUGH' ? roomsFloorArea * (coef.prep_screed + coef.mat_screed) : 0",
    true,
  ),
  objectRule(
    RULE.basePlaster,
    20,
    "finishLevel == 'ROUGH' ? roomsWallArea * (coef.prep_wall_plaster + coef.mat_wall_plaster) : 0",
    true,
  ),
  objectRule(
    RULE.baseElectrics,
    30,
    "finishLevel == 'ROUGH' ? roomsFloorArea * (coef.eng_electrics_sqm + coef.mat_electrics_sqm) : 0",
    true,
  ),
  objectRule(
    RULE.basePlumbing,
    40,
    "finishLevel == 'ROUGH' ? wetRoomsCount * (coef.eng_plumbing_room + coef.mat_plumbing_room) : 0",
    true,
  ),
  objectRule(
    RULE.baseDemolition,
    50,
    "finishLevel == 'LIVED_IN' ? roomsFloorArea * (coef.prep_floor_demolition + coef.mat_demolition_disposal) : 0",
    true,
  ),
  objectRule(
    RULE.baseCleaning,
    60,
    'roomsFloorArea * coef.prep_cleaning',
    true,
  ),
  objectRule(
    RULE.balconyTile,
    70,
    "balconyTiles ? balconyArea * (coef.balcony_tile + (scope == 'PARTIAL' ? coef.labor_balcony_tile : 0)) : 0",
    false,
  ),
  surfaceRule(
    RULE.surfaceFloor,
    'FLOOR',
    "finishLevel == 'ROUGH' ? surfaceArea * (coef.prep_screed + coef.mat_screed) : 0",
  ),
  surfaceRule(
    RULE.surfaceWalls,
    'WALLS',
    "surfaceArea * (finishLevel == 'ROUGH' ? coef.prep_wall_plaster + coef.mat_wall_plaster + coef.prep_wall_putty + coef.mat_putty : coef.prep_wall_putty + coef.mat_putty)",
  ),
  surfaceRule(
    RULE.surfaceCeiling,
    'CEILING',
    "surfaceArea * (finishLevel == 'ROUGH' ? coef.prep_ceiling_plaster + coef.mat_ceiling_plaster + coef.prep_ceiling_putty + coef.mat_putty : coef.prep_ceiling_putty + coef.mat_putty)",
  ),
  categoryRule(
    RULE.floor,
    CATEGORY.floor,
    'floorArea',
    'quantity * (price + coef.laminate_underlay)',
    'floorArea * coef.labor_laminate',
  ),
  categoryRule(
    RULE.wallPaint,
    CATEGORY.wallPaint,
    'wallArea',
    'quantity * price',
    'wallArea * coef.labor_wall_paint',
  ),
  categoryRule(
    RULE.wallTile,
    CATEGORY.wallTile,
    'wallArea',
    'quantity * (price + coef.tile_glue)',
    'wallArea * coef.labor_wall_tile',
  ),
  categoryRule(
    RULE.ceiling,
    CATEGORY.ceiling,
    'floorArea',
    'quantity * price',
    'floorArea * coef.labor_ceiling_paint',
  ),
  categoryRule(
    RULE.skirting,
    CATEGORY.skirting,
    'perimeter',
    'quantity * price',
    null,
  ),
];

const options: PricingOption[] = [
  {
    id: OPTION.electrics,
    code: null,
    kind: 'ENGINEERING',
    priceCents: 999,
    unit: 'ROOM_SQM',
    roomTypeCodes: [],
    priceCoefficientKeys: ['eng_electrics_sqm', 'mat_electrics_sqm'],
    scopes: ['PARTIAL'],
    minQuantity: null,
    maxQuantity: null,
    available: true,
  },
  {
    id: OPTION.extra,
    code: null,
    kind: 'ADDITIONAL',
    priceCents: PRICE_CENTS.extraOption,
    unit: 'PIECE',
    roomTypeCodes: [],
    priceCoefficientKeys: [],
    scopes: ['PARTIAL'],
    minQuantity: null,
    maxQuantity: null,
    available: true,
  },
];

const product = (
  id: string,
  categoryId: string,
  priceCents: number,
  unit: 'SQM' | 'LINEAR_M',
) => ({
  id,
  categoryId,
  materialTypeId: 'mt-generic',
  priceCents,
  unit,
  wastePercentOverride: null,
  heatedFloorCompatible: true,
  available: true,
});

export const scopeData: PricingData = {
  version: '0123456789abcdef',
  exchangeRate: null,
  limits: {
    totalAreaSqm: { min: 10, max: 1000 },
    rooms: { min: 1, max: 20 },
    roomSideM: { min: 1, max: 30 },
    roomHeightM: { min: 2, max: 4 },
    missingAreaHintSqm: 5,
  },
  baseRates: [],
  coefficients: { ...COEFFICIENTS },
  rules,
  roomTypes: [
    { id: 'rt-bedroom', code: 'BEDROOM' },
    { id: 'rt-living', code: 'LIVING_ROOM' },
    { id: 'rt-bathroom', code: 'BATHROOM' },
  ],
  categories: [
    { id: CATEGORY.floor, wastePercent: 0, surface: 'FLOOR' },
    { id: CATEGORY.wallPaint, wastePercent: 0, surface: 'WALLS' },
    { id: CATEGORY.wallTile, wastePercent: 0, surface: 'WALLS' },
    { id: CATEGORY.ceiling, wastePercent: 0, surface: 'CEILING' },
    { id: CATEGORY.skirting, wastePercent: 0, surface: 'NONE' },
  ],
  materialTypes: [{ id: 'mt-generic', code: 'GENERIC' }],
  products: [
    product(PRODUCT.floor, CATEGORY.floor, PRICE_CENTS.floor, 'SQM'),
    product(
      PRODUCT.wallPaint,
      CATEGORY.wallPaint,
      PRICE_CENTS.wallPaint,
      'SQM',
    ),
    product(PRODUCT.wallTile, CATEGORY.wallTile, PRICE_CENTS.wallTile, 'SQM'),
    product(PRODUCT.ceiling, CATEGORY.ceiling, PRICE_CENTS.ceiling, 'SQM'),
    product(
      PRODUCT.skirting,
      CATEGORY.skirting,
      PRICE_CENTS.skirting,
      'LINEAR_M',
    ),
  ],
  packageItems: [
    {
      id: PACKAGE_ITEM.included,
      includedInBase: true,
      priceCents: null,
      unit: null,
    },
    {
      id: PACKAGE_ITEM.charged,
      includedInBase: false,
      priceCents: PRICE_CENTS.chargedPackageItem,
      unit: 'PROJECT',
    },
  ],
  options,
};

export const room = (
  clientId: string,
  overrides: Partial<RoomConfiguration> = {},
): RoomConfiguration => ({
  clientId,
  roomTypeCode: 'BEDROOM',
  lengthM: 4,
  widthM: 3,
  heightM: 2.5,
  heatedFloor: false,
  selections: [],
  ...overrides,
});

export const select = (
  categoryId: string,
  productId: string,
): RoomConfiguration['selections'][number] => ({ categoryId, productId });

export const fullConfiguration = (
  overrides: Partial<Configuration> = {},
): Configuration => ({
  scope: 'FULL',
  finishLevel: 'ROUGH',
  totalAreaSqm: 60,
  balconyAreaSqm: 0,
  balconyTiles: false,
  rooms: [],
  options: [],
  currency: 'USD',
  ...overrides,
});

export const partialConfiguration = (
  overrides: Partial<Configuration> = {},
): Configuration =>
  fullConfiguration({ scope: 'PARTIAL', totalAreaSqm: null, ...overrides });
