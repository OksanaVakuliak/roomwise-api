import type { FactoryProvider } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { CatalogChangeNotifier } from '../catalog/common/catalog-change.notifier';
import { CatalogDatasetService } from '../catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../catalog/dataset/data';
import { CloudinaryService } from '../catalog/images/cloudinary.service';
import { CLOUDINARY_UPLOAD_FOLDER } from '../catalog/images/images.constants';
import { CatalogCache } from '../catalog/public/catalog-cache';

export const SANDBOX_DATASET_PARTICIPANTS = Symbol(
  'SANDBOX_DATASET_PARTICIPANTS',
);

export interface SandboxDatasetParticipant {
  name: string;
  replace(tx: Prisma.TransactionClient): Promise<void>;
  afterCommit?(): Promise<void>;
}

export function catalogParticipant(
  datasetService: CatalogDatasetService,
  cache: CatalogCache,
  cloudinary: CloudinaryService,
  catalogChangeNotifier: CatalogChangeNotifier,
): SandboxDatasetParticipant {
  return {
    name: 'catalog',
    replace: (tx) => datasetService.replace(catalogDataset, tx),
    afterCommit: async () => {
      cache.invalidate();
      catalogChangeNotifier.notify();
      await cloudinary.deleteByPrefix(`${CLOUDINARY_UPLOAD_FOLDER}/`);
    },
  };
}

export const sandboxDatasetParticipantsProvider: FactoryProvider<
  SandboxDatasetParticipant[]
> = {
  provide: SANDBOX_DATASET_PARTICIPANTS,
  inject: [
    CatalogDatasetService,
    CatalogCache,
    CloudinaryService,
    CatalogChangeNotifier,
  ],
  useFactory: (
    catalogDatasetService: CatalogDatasetService,
    catalogCache: CatalogCache,
    cloudinary: CloudinaryService,
    catalogChangeNotifier: CatalogChangeNotifier,
  ) => [
    catalogParticipant(
      catalogDatasetService,
      catalogCache,
      cloudinary,
      catalogChangeNotifier,
    ),
  ],
};
