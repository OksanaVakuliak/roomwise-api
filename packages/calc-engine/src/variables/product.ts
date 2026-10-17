import type { PricingCategory, PricingProduct, ProductUnit } from '../schemas';

export interface ProductVariables {
  readonly price: number;
  readonly waste: number;
  readonly unit: ProductUnit;
}

export function productVariablesOf(
  product: Pick<PricingProduct, 'priceCents' | 'unit'>,
  wastePercent: number,
): ProductVariables {
  return {
    price: product.priceCents / 100,
    waste: wastePercent / 100,
    unit: product.unit,
  };
}

export function productVariables(
  product: PricingProduct,
  category: PricingCategory,
): ProductVariables {
  return productVariablesOf(
    product,
    product.wastePercentOverride ?? category.wastePercent,
  );
}
