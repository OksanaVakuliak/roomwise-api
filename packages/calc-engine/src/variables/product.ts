import type { PricingCategory, PricingProduct, ProductUnit } from '../schemas';

export interface ProductVariables {
  readonly price: number;
  readonly waste: number;
  readonly unit: ProductUnit;
}

export function productVariables(
  product: PricingProduct,
  category: PricingCategory,
): ProductVariables {
  return {
    price: product.priceCents / 100,
    waste: (product.wastePercentOverride ?? category.wastePercent) / 100,
    unit: product.unit,
  };
}
