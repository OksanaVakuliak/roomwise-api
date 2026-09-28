import { describe, expect, it } from 'vitest';
import { PublicationStatus } from '../../../generated/prisma/enums';
import { isDefaultProductAvailable } from './default-product-availability';

describe('isDefaultProductAvailable', () => {
  it('returns true when the product is published and in the pair category', () => {
    const product = {
      status: PublicationStatus.PUBLISHED,
      categoryId: 'category-1',
    };

    expect(isDefaultProductAvailable(product, 'category-1')).toBe(true);
  });

  it('returns false when the product is not published', () => {
    const product = {
      status: PublicationStatus.DRAFT,
      categoryId: 'category-1',
    };

    expect(isDefaultProductAvailable(product, 'category-1')).toBe(false);
  });

  it('returns false when the product moved to another category', () => {
    const product = {
      status: PublicationStatus.PUBLISHED,
      categoryId: 'category-2',
    };

    expect(isDefaultProductAvailable(product, 'category-1')).toBe(false);
  });
});
