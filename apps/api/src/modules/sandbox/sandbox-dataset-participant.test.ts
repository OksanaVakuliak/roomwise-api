import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client';
import type { CatalogChangeNotifier } from '../catalog/common/catalog-change.notifier';
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
    notifier: { notify: vi.fn() },
  };
}

function createParticipant(
  dependencies: ReturnType<typeof createDependencies>,
) {
  return catalogParticipant(
    dependencies.datasetService as unknown as CatalogDatasetService,
    dependencies.cache as unknown as CatalogCache,
    dependencies.cloudinary as unknown as CloudinaryService,
    dependencies.notifier as unknown as CatalogChangeNotifier,
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

  it('invalidates the catalog cache, notifies subscribers and removes uploaded images after commit', async () => {
    const dependencies = createDependencies();

    await createParticipant(dependencies).afterCommit?.();

    expect(dependencies.cache.invalidate).toHaveBeenCalled();
    expect(dependencies.notifier.notify).toHaveBeenCalledOnce();
    expect(dependencies.cloudinary.deleteByPrefix).toHaveBeenCalledWith(
      'roomwise/uploads/',
    );
  });

  it('does not notify subscribers before the transaction commits', async () => {
    const dependencies = createDependencies();

    await createParticipant(dependencies).replace(
      {} as Prisma.TransactionClient,
    );

    expect(dependencies.notifier.notify).not.toHaveBeenCalled();
  });

  it('invalidates the cache and notifies even when the image cleanup fails', async () => {
    const dependencies = createDependencies();
    dependencies.cloudinary.deleteByPrefix.mockRejectedValue(new Error('down'));

    await expect(
      createParticipant(dependencies).afterCommit?.(),
    ).rejects.toThrow('down');
    expect(dependencies.cache.invalidate).toHaveBeenCalled();
    expect(dependencies.notifier.notify).toHaveBeenCalledOnce();
  });
});

describe('sandboxDatasetParticipantsProvider', () => {
  it('registers the catalog as the only participant for now', async () => {
    const dependencies = createDependencies();

    const participants = await sandboxDatasetParticipantsProvider.useFactory(
      dependencies.datasetService,
      dependencies.cache,
      dependencies.cloudinary,
      dependencies.notifier,
    );

    expect(sandboxDatasetParticipantsProvider.provide).toBe(
      SANDBOX_DATASET_PARTICIPANTS,
    );
    expect(participants.map((participant) => participant.name)).toEqual([
      'catalog',
    ]);
  });
});
