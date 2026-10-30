import { randomUUID } from 'node:crypto';
import type { Configuration } from '@roomwise/calc-engine';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  type IdempotencyScope,
  RateSource,
} from '../../src/generated/prisma/enums';
import { CatalogDatasetService } from '../../src/modules/catalog/dataset/catalog-dataset.service';
import { catalogDataset } from '../../src/modules/catalog/dataset/data';
import { categoryIds } from '../../src/modules/catalog/dataset/data/categories';
import { optionIds } from '../../src/modules/catalog/dataset/data/options';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { styleIds } from '../../src/modules/catalog/dataset/data/styles';
import { pricingDataset } from '../../src/modules/pricing/dataset/data';
import { PricingDatasetService } from '../../src/modules/pricing/dataset/pricing-dataset.service';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { PROJECTS_SETTINGS_ID } from '../../src/modules/projects/dataset/projects-settings';
import type { TestApp } from './app-factory';

const SEED_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
const EXCHANGE_RATE = '41.2500';
const LIVING_ROOM_CLIENT_ID = 'living-room';
const BATHROOM_CLIENT_ID = 'bathroom';

export const projectsStyleId = styleIds.scandinavian;

export async function seedProjectsData(testApp: TestApp): Promise<void> {
  const transactionOptions = {
    timeout: SEED_TIMEOUT_MS,
    maxWait: TRANSACTION_MAX_WAIT_MS,
  };

  await testApp.prisma.$transaction(
    (tx) => testApp.app.get(CatalogDatasetService).upsert(catalogDataset, tx),
    transactionOptions,
  );
  await testApp.prisma.$transaction(
    (tx) => testApp.app.get(PricingDatasetService).upsert(pricingDataset, tx),
    transactionOptions,
  );
  await testApp.prisma.exchangeRate.create({
    data: {
      source: RateSource.NBU,
      rate: EXCHANGE_RATE,
      effectiveDate: new Date('2026-09-14'),
      fetchedAt: new Date('2026-09-14T00:30:00Z'),
    },
  });
  await testApp.prisma.projectsSettings.create({
    data: {
      id: PROJECTS_SETTINGS_ID,
      calculationValidityDays: 14,
      leadRetentionDays: 30,
      leadFormNotice: {
        en: 'We keep your request for {days} days, then delete it automatically.',
        uk: 'Ми зберігаємо вашу заявку {days} днів, після чого вона автоматично видаляється.',
      },
    },
  });
  testApp.app.get(PricingDataService).invalidate();
}

export function buildNamedBedroomsConfiguration(): Configuration {
  const base = buildProjectsConfiguration();
  const bedroom = (clientId: string, name: string) => ({
    clientId,
    name,
    roomTypeCode: 'BEDROOM' as const,
    lengthM: 4,
    widthM: 3,
    heightM: 2.7,
    heatedFloor: false,
    selections: [],
  });

  return {
    ...base,
    rooms: [
      bedroom('bedroom-1', 'Master bedroom'),
      bedroom('bedroom-2', 'Kids room'),
    ],
    options: [],
  };
}

export function buildProjectsConfiguration(): Configuration {
  return {
    finishLevel: 'PRE_FINISH',
    totalAreaSqm: 60,
    balconyAreaSqm: 0,
    balconyTiles: false,
    gas: false,
    kitchenType: 'SEPARATE',
    currency: 'USD',
    rooms: [
      {
        clientId: LIVING_ROOM_CLIENT_ID,
        roomTypeCode: 'LIVING_ROOM',
        lengthM: 5,
        widthM: 4,
        heightM: 2.7,
        heatedFloor: false,
        selections: [
          {
            categoryId: categoryIds.floorCovering,
            productId: productIds.lightLaminateFlooring,
          },
        ],
      },
      {
        clientId: BATHROOM_CLIENT_ID,
        roomTypeCode: 'BATHROOM',
        lengthM: 3,
        widthM: 2,
        heightM: 2.6,
        heatedFloor: true,
        selections: [
          {
            categoryId: categoryIds.floorTile,
            productId: productIds.whiteMattePorcelainFloorTile,
          },
          {
            categoryId: categoryIds.wallTile,
            productId: productIds.whiteGlossyWallTile,
          },
        ],
      },
    ],
    options: [
      { optionId: optionIds.heatedFloor, roomClientIds: [BATHROOM_CLIENT_ID] },
      { optionId: optionIds.finalCleaning },
    ],
  };
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export interface CalculationVersionTimes {
  createdAt?: Date;
  expiresAt?: Date;
}

export async function shiftCalculationVersionTimes(
  prisma: PrismaService,
  versionId: string,
  times: CalculationVersionTimes,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE calculation_versions DISABLE TRIGGER calculation_versions_immutable`;
    if (times.createdAt !== undefined) {
      await tx.$executeRaw`UPDATE calculation_versions SET created_at = ${times.createdAt} WHERE id = ${versionId}::uuid`;
    }
    if (times.expiresAt !== undefined) {
      await tx.$executeRaw`UPDATE calculation_versions SET expires_at = ${times.expiresAt} WHERE id = ${versionId}::uuid`;
    }
    await tx.$executeRaw`ALTER TABLE calculation_versions ENABLE TRIGGER calculation_versions_immutable`;
  });
}

export async function shiftLeadCreatedAt(
  prisma: PrismaService,
  leadId: string,
  createdAt: Date,
): Promise<void> {
  await prisma.$executeRaw`UPDATE leads SET created_at = ${createdAt} WHERE id = ${leadId}::uuid`;
}

export async function shiftIdempotencyKeyCreatedAt(
  prisma: PrismaService,
  scope: IdempotencyScope,
  key: string,
  createdAt: Date,
): Promise<void> {
  await prisma.$executeRaw`UPDATE idempotency_keys SET created_at = ${createdAt} WHERE scope = ${scope}::"IdempotencyScope" AND key = ${key}::uuid`;
}
