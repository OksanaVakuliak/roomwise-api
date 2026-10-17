import { toCents } from '../money';
import type {
  Configuration,
  EstimateLine,
  PricingData,
  PricingRule,
  RoomConfiguration,
} from '../schemas';
import { objectVariables, productVariables, roomVariables } from '../variables';
import { createLine, failedLine, roundQuantity } from './line';
import { lineId } from './line-id';
import { runNumericFormula } from './run-formula';

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

function materialLine(
  configuration: Configuration,
  data: PricingData,
  room: RoomConfiguration,
  categoryId: string,
  productId: string,
): EstimateLine {
  const init = {
    id: lineId('MATERIALS', room.clientId, categoryId),
    section: 'MATERIALS',
    roomClientId: room.clientId,
    categoryId,
    productId,
  } as const;
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
  const rule = selectRule(data, categoryId, product.materialTypeId);
  if (rule === undefined) {
    return failedLine(init, 'NOT_CALCULATED', {
      code: 'RULE_NOT_FOUND',
      params: { categoryId, materialTypeId: product.materialTypeId },
    });
  }
  const variables = {
    ...roomVariables(room),
    ...productVariables(product, category),
    ...objectVariables(configuration),
  };
  const { coefficients } = data;
  const ruled = { ...init, ruleId: rule.id };
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
  return createLine({
    ...ruled,
    quantity: roundQuantity(quantity.value),
    unit: product.unit,
    unitPriceCents: product.priceCents,
    amountCents: toCents(cost.value),
  });
}

export function materialLines(
  configuration: Configuration,
  data: PricingData,
): EstimateLine[] {
  return configuration.rooms.flatMap((room) =>
    room.selections.flatMap(({ categoryId, productId }) =>
      productId === null
        ? []
        : [materialLine(configuration, data, room, categoryId, productId)],
    ),
  );
}
