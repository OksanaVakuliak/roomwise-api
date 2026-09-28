import { describe, expect, it } from 'vitest';
import { productImagesInputSchema } from './create-product.schema';

describe('productImagesInputSchema', () => {
  it('accepts distinct image ids with at most one primary', () => {
    const result = productImagesInputSchema.safeParse([
      { imageId: crypto.randomUUID(), isPrimary: true },
      { imageId: crypto.randomUUID(), isPrimary: false },
    ]);

    expect(result.success).toBe(true);
  });

  it('rejects more than one primary image', () => {
    const result = productImagesInputSchema.safeParse([
      { imageId: crypto.randomUUID(), isPrimary: true },
      { imageId: crypto.randomUUID(), isPrimary: true },
    ]);

    expect(result.success).toBe(false);
  });

  it('rejects a repeated image id', () => {
    const imageId = crypto.randomUUID();

    const result = productImagesInputSchema.safeParse([
      { imageId, isPrimary: true },
      { imageId, isPrimary: false },
    ]);

    expect(result.success).toBe(false);
  });
});
