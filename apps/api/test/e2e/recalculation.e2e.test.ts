import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Clock } from '../../src/common/clock/clock';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import type { Prisma } from '../../src/generated/prisma/client';
import { PublicationStatus } from '../../src/generated/prisma/enums';
import { optionIds } from '../../src/modules/catalog/dataset/data/options';
import { productIds } from '../../src/modules/catalog/dataset/data/products';
import { CatalogCache } from '../../src/modules/catalog/public/catalog-cache';
import { PricingDataService } from '../../src/modules/pricing/pricing-data/pricing-data.service';
import { PROJECTS_SETTINGS_ID } from '../../src/modules/projects/dataset/projects-settings';
import { ProjectsSettingsService } from '../../src/modules/projects/settings/projects-settings.service';
import { createTestApp, type TestApp } from './app-factory';
import {
  buildNamedBedroomsConfiguration,
  buildProjectsConfiguration,
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const NAMED_ROOMS_IP = '10.40.0.1';
const OPTION_IP = '10.40.0.2';
const CATEGORY_IP = '10.40.0.3';
const UNPUBLISHED_STYLE_IP = '10.40.0.4';
const DELETED_STYLE_IP = '10.40.0.5';
const CALCULATIONS = '/api/v1/public/calculations';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const UNKNOWN_PUBLIC_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const UNKNOWN_VERSION_NUMBER = 99;
const COEFFICIENT_KEY = 'laminate_underlay';
const CHANGED_COEFFICIENT_VALUE = 7;
const MS_PER_DAY = 86_400_000;
const VALIDITY_DAYS = 14;
const CHANGED_VALIDITY_DAYS = 30;
const PAST_EXPIRY_DAYS = 15;
const THROWAWAY_SORT_ORDER = 9100;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

interface LineView {
  productId: string | null;
  categoryId: string | null;
  optionId: string | null;
  optionName: string | null;
  categoryName: string | null;
  product: { name: string } | null;
  status: string;
}

describe('recalculation e2e', () => {
  let testApp: TestApp;
  let currentPricingVersion: string;
  let now = Date.now();

  function invalidateCaches(): void {
    testApp.app.get(PricingDataService).invalidate();
    testApp.app.get(CatalogCache).invalidate();
    testApp.app.get(ProjectsSettingsService).invalidate();
  }

  function clientHeaders(key: string, ip?: string): Record<string, string> {
    return ip === undefined
      ? { [IDEMPOTENCY_HEADER]: key }
      : { [IDEMPOTENCY_HEADER]: key, [FORWARDED_FOR_HEADER]: ip };
  }

  async function saveVersion(
    configuration = buildProjectsConfiguration(),
    styleId: string = projectsStyleId,
    ip?: string,
  ) {
    const response = await request(testApp.http)
      .post(CALCULATIONS)
      .set(clientHeaders(newIdempotencyKey(), ip))
      .send({
        configuration,
        styleId,
        clientPricingVersion: currentPricingVersion,
        clientTotalUsdCents: 1,
      })
      .expect(201);

    return response.body.version;
  }

  function recalculate(
    publicId: string,
    basedOnVersion = 1,
    key = newIdempotencyKey(),
    ip?: string,
  ) {
    return request(testApp.http)
      .post(`${CALCULATIONS}/${publicId}/versions`)
      .set(clientHeaders(key, ip))
      .send({ basedOnVersion });
  }

  function latest(publicId: string) {
    return request(testApp.http).get(`${CALCULATIONS}/${publicId}`);
  }

  function versionByNumber(publicId: string, number: number) {
    return request(testApp.http).get(
      `${CALCULATIONS}/${publicId}/versions/${number}`,
    );
  }

  function findLine(lines: LineView[], productId: string): LineView {
    const line = lines.find((item) => item.productId === productId);
    expect(line).toBeDefined();

    return line as LineView;
  }

  async function withCoefficientValue<T>(
    value: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const original = await testApp.prisma.coefficient.findUniqueOrThrow({
      where: { key: COEFFICIENT_KEY },
    });

    try {
      await testApp.prisma.coefficient.update({
        where: { key: COEFFICIENT_KEY },
        data: { value },
      });
      invalidateCaches();

      return await action();
    } finally {
      await testApp.prisma.coefficient.update({
        where: { key: COEFFICIENT_KEY },
        data: { value: original.value },
      });
      invalidateCaches();
    }
  }

  async function withArchivedProduct<T>(
    productId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const original = await testApp.prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });

    try {
      await testApp.prisma.product.update({
        where: { id: productId },
        data: { status: PublicationStatus.ARCHIVED },
      });
      invalidateCaches();

      return await action();
    } finally {
      await testApp.prisma.product.update({
        where: { id: productId },
        data: { status: original.status },
      });
      invalidateCaches();
    }
  }

  async function createThrowawayProduct(categoryId?: string): Promise<string> {
    const { id, revision, updatedAt, ...template } =
      await testApp.prisma.product.findUniqueOrThrow({
        where: { id: productIds.whiteGlossyWallTile },
      });
    const created = await testApp.prisma.product.create({
      data: {
        ...template,
        categoryId: categoryId ?? template.categoryId,
        name: template.name as Prisma.InputJsonValue,
        description: template.description as Prisma.InputJsonValue,
        color: template.color as Prisma.InputJsonValue,
        size: template.size as Prisma.InputJsonValue,
        textureImageId: null,
        updatedById: null,
      },
    });
    invalidateCaches();

    return created.id;
  }

  async function createThrowawayCategory(): Promise<string> {
    const { id, revision, updatedAt, ...template } =
      await testApp.prisma.category.findFirstOrThrow({
        where: { status: PublicationStatus.PUBLISHED },
      });
    const created = await testApp.prisma.category.create({
      data: {
        ...template,
        name: template.name as Prisma.InputJsonValue,
        updatedById: null,
      },
    });
    invalidateCaches();

    return created.id;
  }

  async function createThrowawayOption(): Promise<string> {
    const { id, revision, updatedAt, ...template } =
      await testApp.prisma.option.findUniqueOrThrow({
        where: { id: optionIds.finalCleaning },
      });
    const created = await testApp.prisma.option.create({
      data: {
        ...template,
        code: null,
        sortOrder: THROWAWAY_SORT_ORDER,
        name: template.name as Prisma.InputJsonValue,
        description: template.description as Prisma.InputJsonValue,
        imageId: null,
        updatedById: null,
      },
    });
    invalidateCaches();

    return created.id;
  }

  async function createThrowawayStyle(): Promise<string> {
    const { id, revision, updatedAt, ...template } =
      await testApp.prisma.style.findUniqueOrThrow({
        where: { id: projectsStyleId },
      });
    const created = await testApp.prisma.style.create({
      data: {
        ...template,
        sortOrder: THROWAWAY_SORT_ORDER,
        name: template.name as Prisma.InputJsonValue,
        description: template.description as Prisma.InputJsonValue,
        imageId: null,
        updatedById: null,
      },
    });
    invalidateCaches();

    return created.id;
  }

  async function deleteOption(optionId: string): Promise<void> {
    await testApp.prisma.option.deleteMany({ where: { id: optionId } });
    invalidateCaches();
  }

  async function deleteCategory(categoryId: string): Promise<void> {
    await testApp.prisma.category.deleteMany({ where: { id: categoryId } });
    invalidateCaches();
  }

  async function deleteStyle(styleId: string): Promise<void> {
    await testApp.prisma.style.deleteMany({ where: { id: styleId } });
    invalidateCaches();
  }

  async function deleteProduct(productId: string): Promise<void> {
    await testApp.prisma.product.deleteMany({ where: { id: productId } });
    invalidateCaches();
  }

  async function withValidityDays<T>(
    days: number,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      await testApp.prisma.projectsSettings.update({
        where: { id: PROJECTS_SETTINGS_ID },
        data: { calculationValidityDays: days },
      });
      invalidateCaches();

      return await action();
    } finally {
      await testApp.prisma.projectsSettings.update({
        where: { id: PROJECTS_SETTINGS_ID },
        data: { calculationValidityDays: VALIDITY_DAYS },
      });
      invalidateCaches();
    }
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      overrides: [{ provide: Clock, useValue: { now: () => new Date(now) } }],
    });
    await seedProjectsData(testApp);

    const pricing = await request(testApp.http)
      .get('/api/v1/public/pricing-data')
      .expect(200);
    currentPricingVersion = pricing.body.version as string;
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('price status', () => {
    it('reports no change while prices are unchanged', async () => {
      const { publicId } = await saveVersion();

      const response = await latest(publicId);

      expect(response.status).toBe(200);
      expect(response.body.priceStatus).toMatchObject({
        changed: false,
        diffCents: 0,
        unavailableItems: [],
      });
      expect(response.body.priceStatus.snapshotTotalUsdCents).toBe(
        response.body.totals.usdCents,
      );
      expect(response.body.priceStatus.currentTotalUsdCents).toBe(
        response.body.totals.usdCents,
      );
    });

    it('reports the difference after a coefficient changes and keeps the snapshot', async () => {
      const { publicId } = await saveVersion();
      const before = (await latest(publicId)).body;

      const after = await withCoefficientValue(CHANGED_COEFFICIENT_VALUE, () =>
        latest(publicId),
      );
      const { priceStatus } = after.body;

      expect(priceStatus.changed).toBe(true);
      expect(priceStatus.snapshotTotalUsdCents).toBe(before.totals.usdCents);
      expect(priceStatus.currentTotalUsdCents).not.toBe(before.totals.usdCents);
      expect(priceStatus.diffCents).toBe(
        priceStatus.currentTotalUsdCents - priceStatus.snapshotTotalUsdCents,
      );
      expect(after.body.totals).toEqual(before.totals);
      expect(after.body.lines).toEqual(before.lines);
    });

    it('lists products archived since the snapshot as unavailable items', async () => {
      const { publicId } = await saveVersion();

      const response = await withArchivedProduct(
        productIds.whiteGlossyWallTile,
        () => latest(publicId),
      );
      const { priceStatus } = response.body;

      expect(priceStatus.changed).toBe(true);
      expect(priceStatus.unavailableItems).toHaveLength(1);
      expect(priceStatus.unavailableItems[0]).toMatchObject({
        productId: productIds.whiteGlossyWallTile,
      });
    });
  });

  describe('POST /api/v1/public/calculations/{publicId}/versions', () => {
    it('treats a hard-deleted product as unavailable in price status and recalculation', async () => {
      const productId = await createThrowawayProduct();

      try {
        const configuration = buildProjectsConfiguration();
        const selection = configuration.rooms[1].selections[1];
        selection.productId = productId;
        const first = await saveVersion(configuration);
        const { publicId } = first;
        expect(findLine(first.lines, productId).status).toBe('OK');

        await deleteProduct(productId);
        const status = await latest(publicId);
        const recalculated = await recalculate(publicId);

        expect(status.status).toBe(200);
        expect(status.body.priceStatus.changed).toBe(true);
        expect(status.body.priceStatus.unavailableItems).toHaveLength(1);
        expect(status.body.priceStatus.unavailableItems[0]).toMatchObject({
          productId,
        });
        expect(recalculated.status).toBe(201);
        expect(findLine(recalculated.body.lines, productId).status).toBe(
          'UNAVAILABLE',
        );
        expect(findLine(recalculated.body.lines, productId).product?.name).toBe(
          findLine(first.lines, productId).product?.name,
        );
        expect(recalculated.body.totals.usdCents).toBeLessThan(
          first.totals.usdCents,
        );
      } finally {
        await deleteProduct(productId);
      }
    });

    it('treats a hard-deleted option as unavailable in price status and recalculation', async () => {
      const optionId = await createThrowawayOption();

      try {
        const configuration = buildProjectsConfiguration();
        configuration.options.push({ optionId });
        const first = await saveVersion(
          configuration,
          projectsStyleId,
          OPTION_IP,
        );
        const { publicId } = first;
        const optionLine = (lines: LineView[]) =>
          lines.find((line) => line.optionId === optionId);
        expect(optionLine(first.lines)?.status).toBe('OK');

        await deleteOption(optionId);
        const status = await latest(publicId);
        const recalculated = await recalculate(
          publicId,
          1,
          newIdempotencyKey(),
          OPTION_IP,
        );

        expect(status.status).toBe(200);
        expect(status.body.priceStatus.changed).toBe(true);
        expect(status.body.priceStatus.unavailableItems).toHaveLength(1);
        expect(status.body.priceStatus.unavailableItems[0]).toMatchObject({
          optionId,
        });
        expect(recalculated.status).toBe(201);
        expect(optionLine(recalculated.body.lines)?.status).toBe('UNAVAILABLE');
        expect(optionLine(recalculated.body.lines)?.optionName).toBe(
          optionLine(first.lines)?.optionName,
        );
        expect(optionLine(first.lines)?.optionName).toEqual(expect.any(String));
        expect(recalculated.body.totals.usdCents).toBeLessThan(
          first.totals.usdCents,
        );
      } finally {
        await deleteOption(optionId);
      }
    });

    it('treats a hard-deleted category as unavailable in price status and recalculation', async () => {
      const categoryId = await createThrowawayCategory();
      const productId = await createThrowawayProduct(categoryId);

      try {
        const configuration = buildProjectsConfiguration();
        configuration.rooms[0].selections.push({ categoryId, productId });
        const first = await saveVersion(
          configuration,
          projectsStyleId,
          CATEGORY_IP,
        );
        const { publicId } = first;
        const categoryLine = (lines: LineView[]) =>
          lines.find((line) => line.categoryId === categoryId);
        expect(categoryLine(first.lines)?.status).not.toBe('UNAVAILABLE');

        await deleteProduct(productId);
        await deleteCategory(categoryId);
        const status = await latest(publicId);
        const recalculated = await recalculate(
          publicId,
          1,
          newIdempotencyKey(),
          CATEGORY_IP,
        );

        expect(status.status).toBe(200);
        expect(status.body.priceStatus.changed).toBe(true);
        expect(status.body.priceStatus.unavailableItems).toHaveLength(1);
        expect(recalculated.status).toBe(201);
        expect(categoryLine(recalculated.body.lines)?.status).toBe(
          'UNAVAILABLE',
        );
        expect(categoryLine(recalculated.body.lines)?.categoryName).toBe(
          categoryLine(first.lines)?.categoryName,
        );
        expect(categoryLine(first.lines)?.categoryName).toEqual(
          expect.any(String),
        );
      } finally {
        await deleteProduct(productId);
        await deleteCategory(categoryId);
      }
    });

    it('recalculates a calculation whose style was unpublished', async () => {
      const styleId = await createThrowawayStyle();

      try {
        const first = await saveVersion(
          buildProjectsConfiguration(),
          styleId,
          UNPUBLISHED_STYLE_IP,
        );
        await testApp.prisma.style.update({
          where: { id: styleId },
          data: { status: PublicationStatus.DRAFT },
        });
        invalidateCaches();

        const recalculated = await recalculate(
          first.publicId,
          1,
          newIdempotencyKey(),
          UNPUBLISHED_STYLE_IP,
        );

        expect(recalculated.status).toBe(201);
        expect(recalculated.body.style).toEqual(first.style);
        expect(recalculated.body.totals).toEqual(first.totals);
      } finally {
        await deleteStyle(styleId);
      }
    });

    it('recalculates a calculation whose style was deleted', async () => {
      const styleId = await createThrowawayStyle();

      try {
        const first = await saveVersion(
          buildProjectsConfiguration(),
          styleId,
          DELETED_STYLE_IP,
        );
        await deleteStyle(styleId);

        const recalculated = await recalculate(
          first.publicId,
          1,
          newIdempotencyKey(),
          DELETED_STYLE_IP,
        );

        expect(recalculated.status).toBe(201);
        expect(recalculated.body.style).toEqual(first.style);
        expect(recalculated.body.totals).toEqual(first.totals);
      } finally {
        await deleteStyle(styleId);
      }
    });

    it('keeps the room names in the new version', async () => {
      const first = await request(testApp.http)
        .post(CALCULATIONS)
        .set(FORWARDED_FOR_HEADER, NAMED_ROOMS_IP)
        .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
        .send({
          configuration: buildNamedBedroomsConfiguration(),
          styleId: projectsStyleId,
          clientPricingVersion: currentPricingVersion,
          clientTotalUsdCents: 1,
        })
        .expect(201);

      const recalculated = await recalculate(first.body.version.publicId).set(
        FORWARDED_FOR_HEADER,
        NAMED_ROOMS_IP,
      );

      expect(recalculated.status).toBe(201);
      expect(
        recalculated.body.rooms.map((room: { name: string }) => room.name),
      ).toEqual(['Master bedroom', 'Kids room']);
    });

    it('creates a new version with current prices from the same configuration and style and leaves the old one intact', async () => {
      const first = await saveVersion();
      const { publicId } = first;
      const oldBefore = (await versionByNumber(publicId, 1)).body;

      const { recalculated, current, old } = await withCoefficientValue(
        CHANGED_COEFFICIENT_VALUE,
        async () => ({
          recalculated: await recalculate(publicId),
          current: await latest(publicId),
          old: await versionByNumber(publicId, 1),
        }),
      );

      expect(recalculated.status).toBe(201);
      expect(recalculated.body.number).toBe(2);
      expect(recalculated.body.totals.usdCents).not.toBe(first.totals.usdCents);
      expect(recalculated.body.priceStatus.changed).toBe(false);
      expect(recalculated.body.priceStatus.currentTotalUsdCents).toBe(
        recalculated.body.totals.usdCents,
      );

      expect(current.body.number).toBe(2);
      expect(
        current.body.versions.map((item: { number: number }) => item.number),
      ).toEqual([2, 1]);

      expect(old.body.number).toBe(1);
      expect(old.body.lines).toEqual(oldBefore.lines);
      expect(old.body.totals).toEqual(oldBefore.totals);
      expect(old.body.createdAt).toBe(oldBefore.createdAt);
      expect(old.body.configuration).toEqual(oldBefore.configuration);
      expect(first.configuration).toEqual(buildProjectsConfiguration());
      expect(recalculated.body.configuration).toEqual(first.configuration);
      expect(recalculated.body.style).toEqual(first.style);
    });

    it('marks archived products unavailable and excludes them from totals', async () => {
      const first = await saveVersion();
      const { publicId } = first;

      const { recalculated, current, old } = await withArchivedProduct(
        productIds.whiteGlossyWallTile,
        async () => ({
          recalculated: await recalculate(publicId),
          current: await latest(publicId),
          old: await versionByNumber(publicId, 1),
        }),
      );
      const line = findLine(
        recalculated.body.lines,
        productIds.whiteGlossyWallTile,
      );

      expect(recalculated.status).toBe(201);
      expect(line.status).toBe('UNAVAILABLE');
      expect(recalculated.body.totals.usdCents).toBeLessThan(
        first.totals.usdCents,
      );
      expect(current.body.priceStatus.changed).toBe(false);
      expect(current.body.priceStatus.unavailableItems).toEqual([]);
      expect(old.body.priceStatus.changed).toBe(true);
      expect(old.body.priceStatus.unavailableItems).toHaveLength(1);
    });

    it('replays the response for the same key and body', async () => {
      const { publicId } = await saveVersion();
      const key = newIdempotencyKey();

      const first = await recalculate(publicId, 1, key);
      const replay = await recalculate(publicId, 1, key);
      const current = await latest(publicId);

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(first.body);
      expect(current.body.versions).toHaveLength(2);
    });

    it('answers 404 for an unknown publicId', async () => {
      const response = await recalculate(UNKNOWN_PUBLIC_ID);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    });

    it('answers 404 for an unknown based-on version', async () => {
      const { publicId } = await saveVersion();

      const response = await recalculate(publicId, UNKNOWN_VERSION_NUMBER);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.CALCULATION_NOT_FOUND);
    });

    it('gives parallel recalculations distinct version numbers', async () => {
      const { publicId } = await saveVersion();

      const responses = await Promise.all([
        recalculate(publicId),
        recalculate(publicId),
      ]);
      const numbers = responses
        .map((response) => response.body.number as number)
        .sort();

      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(numbers).toEqual([2, 3]);
    });
  });

  describe('expiry', () => {
    it('marks versions expired once the clock passes expiresAt', async () => {
      const { publicId } = await saveVersion();
      const startedAt = now;

      try {
        now = startedAt + PAST_EXPIRY_DAYS * MS_PER_DAY;
        const response = await latest(publicId);

        expect(response.body.expired).toBe(true);
        expect(response.body.priceStatus.changed).toBe(false);
        expect(response.body.versions[0].expired).toBe(true);
      } finally {
        now = startedAt;
      }
    });

    it('keeps expiresAt of existing versions when the validity setting changes', async () => {
      const first = await saveVersion();

      const { unchanged, created } = await withValidityDays(
        CHANGED_VALIDITY_DAYS,
        async () => ({
          unchanged: await latest(first.publicId),
          created: (await recalculate(first.publicId)).body,
        }),
      );
      const lifetime =
        new Date(created.expiresAt).getTime() -
        new Date(created.createdAt).getTime();

      expect(unchanged.body.expiresAt).toBe(first.expiresAt);
      expect(lifetime).toBe(CHANGED_VALIDITY_DAYS * MS_PER_DAY);
    });
  });
});
