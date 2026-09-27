import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client';
import type { CatalogDatasetService } from '../catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../catalog/dataset/data';
import type { CloudinaryService } from '../catalog/images/cloudinary.service';
import type { CatalogCache } from '../catalog/public/catalog-cache';
import {
  catalogParticipant,
  SANDBOX_DATASET_PARTICIPANTS,
  sandboxDatasetParticipantsProvider,
} from './sandbox-dataset-participant';

function createDependencies() {
  return {
    datasetService: {
      replace: vi.fn().mockResolvedValue(undefined),
    },
    cache: { invalidate: vi.fn() },
    cloudinary: { deleteByPrefix: vi.fn().mockResolvedValue(undefined) },
  };
}

function createParticipant(
  dependencies: ReturnType<typeof createDependencies>,
) {
  return catalogParticipant(
    dependencies.datasetService as unknown as CatalogDatasetService,
    dependencies.cache as unknown as CatalogCache,
    dependencies.cloudinary as unknown as CloudinaryService,
  );
}

describe('catalogParticipant', () => {
  it('replaces the catalog with the demo dataset in the given transaction', async () => {
    const dependencies = createDependencies();
    const tx = {} as Prisma.TransactionClient;

    await createParticipant(dependencies).replace(tx);

    expect(dependencies.datasetService.replace).toHaveBeenCalledWith(
      catalogDataset,
      tx,
    );
  });

  it('invalidates the catalog cache and removes uploaded images after commit', async () => {
    const dependencies = createDependencies();

    await createParticipant(dependencies).afterCommit?.();

    expect(dependencies.cache.invalidate).toHaveBeenCalled();
    expect(dependencies.cloudinary.deleteByPrefix).toHaveBeenCalledWith(
      'roomwise/uploads/',
    );
  });

  it('invalidates the cache even when the image cleanup fails', async () => {
    const dependencies = createDependencies();
    dependencies.cloudinary.deleteByPrefix.mockRejectedValue(new Error('down'));

    await expect(
      createParticipant(dependencies).afterCommit?.(),
    ).rejects.toThrow('down');
    expect(dependencies.cache.invalidate).toHaveBeenCalled();
  });
});

describe('sandboxDatasetParticipantsProvider', () => {
  it('registers the catalog as the only participant for now', async () => {
    const dependencies = createDependencies();

    const participants = await sandboxDatasetParticipantsProvider.useFactory(
      dependencies.datasetService,
      dependencies.cache,
      dependencies.cloudinary,
    );

    expect(sandboxDatasetParticipantsProvider.provide).toBe(
      SANDBOX_DATASET_PARTICIPANTS,
    );
    expect(participants.map((participant) => participant.name)).toEqual([
      'catalog',
    ]);
  });
});
