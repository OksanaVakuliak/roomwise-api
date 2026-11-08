import type { EvaluationScope } from '../formula/evaluate';
import type {
  Configuration,
  EstimateLine,
  EstimateWarning,
  LineComponent,
  PricingData,
  PricingRule,
  RoomConfiguration,
  RoomSelection,
} from '../schemas';
import type { ObjectVariables } from '../variables';
import {
  areaShareError,
  areaShareOf,
  productVariables,
  roomVariables,
} from '../variables';
import {
  componentCents,
  createLine,
  failedLine,
  MAX_LINE_CENTS,
  outOfRange,
  roundQuantity,
} from './line';
import { lineId } from './line-id';
import { runNumericFormula } from './run-formula';
import { applySurfacePrep } from './surfaces';

type MaterialRule = PricingRule & { quantityFormula: string };

const isMaterialRule = (rule: PricingRule): rule is MaterialRule =>
  rule.quantityFormula !== null;

function selectRule(
  data: PricingData,
  categoryId: string,
  materialTypeId: string,
): MaterialRule | undefined {
  const rules = data.rules.filter(isMaterialRule);
  return (
    rules.find(
      (rule) =>
        rule.level === 'MATERIAL_TYPE' &&
        rule.categoryId === categoryId &&
        rule.materialTypeId === materialTypeId,
    ) ??
    rules.find(
      (rule) => rule.level === 'CATEGORY' && rule.categoryId === categoryId,
    )
  );
}

function splitAccessories(
  rule: MaterialRule,
  data: PricingData,
  variables: EvaluationScope['variables'],
  fullCents: number,
): LineComponent[] {
  const whole: LineComponent[] = [
    { kind: 'MATERIAL', ruleId: rule.id, amountCents: fullCents },
  ];
  const keys = Object.keys(data.accessories ?? {}).filter((key) =>
    Object.hasOwn(data.coefficients, key),
  );
  if (keys.length === 0) {
    return whole;
  }
  const zeroed = Object.fromEntries(keys.map((key) => [key, 0]));
  const costValue = (overrides: Readonly<Record<string, number>>) => {
    const outcome = runNumericFormula(rule.costFormula, {
      variables,
      coefficients: { ...data.coefficients, ...overrides },
    });
    return outcome.ok ? outcome.value : null;
  };
  const productValue = costValue(zeroed);
  if (productValue === null) {
    return whole;
  }
  const productCents = componentCents(productValue);
  if (productCents === null) {
    return whole;
  }
  const parts: { key: string; cents: number }[] = [];
  for (const key of keys) {
    const withKey = costValue({ ...zeroed, [key]: data.coefficients[key] });
    if (withKey === null) {
      return whole;
    }
    const cents = componentCents(Math.max(withKey - productValue, 0));
    if (cents === null) {
      return whole;
    }
    if (cents > 0) {
      parts.push({ key, cents });
    }
  }
  if (parts.length === 0) {
    return whole;
  }
  const remainder =
    fullCents - productCents - parts.reduce((sum, part) => sum + part.cents, 0);
  const last = parts[parts.length - 1];
  last.cents += remainder;
  if (last.cents < 0) {
    return whole;
  }
  const priced = parts.filter((part) => part.cents > 0);
  if (priced.length === 0) {
    return whole;
  }
  return [
    { kind: 'MATERIAL', ruleId: rule.id, amountCents: productCents },
    ...priced.map(
      (part): LineComponent => ({
        kind: 'ACCESSORY',
        ruleId: rule.id,
        coefficientKey: part.key,
        amountCents: part.cents,
      }),
    ),
  ];
}

function materialLine(
  configuration: Configuration,
  data: PricingData,
  room: RoomConfiguration,
  selection: RoomSelection,
  objectScope: ObjectVariables,
): EstimateLine {
  const { categoryId } = selection;
  const productId = selection.productId as string;
  const init = {
    id: lineId('MATERIALS', room.clientId, categoryId),
    section: 'MATERIALS',
    roomClientId: room.clientId,
    categoryId,
    productId,
  } as const;
  const shareError = areaShareError(room, selection, data.categories);
  if (shareError !== null) {
    return failedLine(init, 'ERROR', shareError);
  }
  const category = data.categories.find((item) => item.id === categoryId);
  const product = data.products.find(
    (item) => item.id === productId && item.categoryId === categoryId,
  );
  if (product === undefined || category === undefined || !product.available) {
    return failedLine(init, 'UNAVAILABLE', {
      code: 'PRODUCT_UNAVAILABLE',
      params: { productId },
    });
  }
  const warnings: EstimateWarning[] =
    room.heatedFloor &&
    category.surface === 'FLOOR' &&
    !product.heatedFloorCompatible
      ? [{ code: 'HEATED_FLOOR_INCOMPATIBLE', params: { productId } }]
      : [];
  const rule = selectRule(data, categoryId, product.materialTypeId);
  if (rule === undefined) {
    return failedLine({ ...init, warnings }, 'NOT_CALCULATED', {
      code: 'RULE_NOT_FOUND',
      params: { categoryId, materialTypeId: product.materialTypeId },
    });
  }
  const base = roomVariables(room);
  const share = areaShareOf(selection);
  const variables = {
    ...base,
    wallArea:
      category.surface === 'WALLS' ? base.wallArea * share : base.wallArea,
    floorArea:
      category.surface === 'FLOOR' ? base.floorArea * share : base.floorArea,
    ...productVariables(product, category),
    ...objectScope,
  };
  const { coefficients } = data;
  const ruled = { ...init, warnings, ruleId: rule.id };
  const quantity = runNumericFormula(rule.quantityFormula, {
    variables,
    coefficients,
  });
  if (!quantity.ok) {
    return failedLine(ruled, 'ERROR', quantity.error);
  }
  const cost = runNumericFormula(rule.costFormula, {
    variables: { ...variables, quantity: quantity.value },
    coefficients,
  });
  if (!cost.ok) {
    return failedLine(ruled, 'ERROR', cost.error);
  }
  const materialCents = componentCents(cost.value);
  if (materialCents === null) {
    return failedLine(ruled, 'ERROR', outOfRange());
  }
  const components: LineComponent[] = splitAccessories(
    rule,
    data,
    { ...variables, quantity: quantity.value },
    materialCents,
  );
  const lineWarnings = [...warnings];
  if (configuration.scope === 'PARTIAL') {
    let laborCents = 0;
    if (rule.laborFormula === null) {
      lineWarnings.push({
        code: 'LABOR_RATE_MISSING',
        params: { categoryId },
      });
    } else {
      const labor = runNumericFormula(rule.laborFormula, {
        variables: { ...variables, quantity: quantity.value },
        coefficients,
      });
      if (!labor.ok) {
        return failedLine(ruled, 'ERROR', labor.error);
      }
      const cents = componentCents(labor.value);
      if (cents === null) {
        return failedLine(ruled, 'ERROR', outOfRange());
      }
      laborCents = cents;
    }
    components.push({
      kind: 'LABOR',
      ruleId: rule.id,
      amountCents: laborCents,
    });
  }
  const amountCents = components.reduce(
    (sum, component) => sum + component.amountCents,
    0,
  );
  if (amountCents > MAX_LINE_CENTS) {
    return failedLine(ruled, 'ERROR', outOfRange());
  }
  return createLine({
    ...ruled,
    warnings: lineWarnings,
    quantity: roundQuantity(quantity.value),
    unit: product.unit,
    unitPriceCents: product.priceCents,
    amountCents,
    components,
  });
}

export function materialLines(
  configuration: Configuration,
  data: PricingData,
  objectScope: ObjectVariables,
): EstimateLine[] {
  return configuration.rooms.flatMap((room) => {
    const lines = room.selections.flatMap((selection) =>
      selection.productId === null
        ? []
        : [materialLine(configuration, data, room, selection, objectScope)],
    );
    return configuration.scope === 'PARTIAL'
      ? applySurfacePrep(data, room, lines, objectScope)
      : lines;
  });
}
