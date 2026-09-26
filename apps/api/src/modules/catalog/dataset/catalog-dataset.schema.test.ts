import { describe, expect, it } from 'vitest';
import { catalogDatasetSchema } from './catalog-dataset.schema';
import { catalogDataset } from './data';

function cloneDataset(): typeof catalogDataset {
  return structuredClone(catalogDataset);
}

describe('catalogDatasetSchema', () => {
  it('parses the real seed dataset', () => {
    expect(catalogDatasetSchema.safeParse(catalogDataset).success).toBe(true);
  });

  it('rejects a duplicate product id', () => {
    const dataset = cloneDataset();
    dataset.products[1].id = dataset.products[0].id;

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['products', 1, 'id'],
        message: expect.stringContaining('Duplicate product id'),
      }),
    );
  });

  it('rejects a duplicate style id', () => {
    const dataset = cloneDataset();
    dataset.styles[1].id = dataset.styles[0].id;

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['styles', 1, 'id'],
        message: expect.stringContaining('Duplicate style id'),
      }),
    );
  });

  it('rejects a duplicate engineering item id', () => {
    const dataset = cloneDataset();
    dataset.engineeringItems[1].id = dataset.engineeringItems[0].id;

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['engineeringItems', 1, 'id'],
        message: expect.stringContaining('Duplicate engineering item id'),
      }),
    );
  });

  it('rejects a duplicate option id', () => {
    const dataset = cloneDataset();
    dataset.options[1].id = dataset.options[0].id;

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['options', 1, 'id'],
        message: expect.stringContaining('Duplicate option id'),
      }),
    );
  });

  it('rejects a duplicate image publicId', () => {
    const dataset = cloneDataset();
    dataset.images[1].publicId = dataset.images[0].publicId;

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['images', 1, 'publicId'],
        message: expect.stringContaining('Duplicate image publicId'),
      }),
    );
  });

  it('rejects two options sharing the same kind and sortOrder', () => {
    const dataset = cloneDataset();
    dataset.options[1].kind = dataset.options[0].kind;
    dataset.options[1].sortOrder = dataset.options[0].sortOrder;

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['options', 1, 'sortOrder'],
        message: expect.stringContaining('Duplicate option kind and sortOrder'),
      }),
    );
  });

  it('rejects duplicate ids inside an option roomTypeIds list', () => {
    const dataset = cloneDataset();
    const perRoomOption = dataset.options.find(
      (option) => option.roomTypeIds.length > 0,
    );
    if (!perRoomOption) {
      throw new Error('Expected at least one seed option with roomTypeIds');
    }
    perRoomOption.roomTypeIds = [
      perRoomOption.roomTypeIds[0],
      perRoomOption.roomTypeIds[0],
    ];

    const result = catalogDatasetSchema.safeParse(dataset);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('duplicate room type'),
      }),
    );
  });
});
