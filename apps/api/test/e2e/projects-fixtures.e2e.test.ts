import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './app-factory';
import {
  buildProjectsConfiguration,
  newIdempotencyKey,
  seedProjectsData,
  shiftCalculationVersionTimes,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const SNAPSHOT_SCHEMA_VERSION = 1;

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

describe('projects fixtures', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedProjectsData(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('builds a configuration accepted by the estimates endpoint', async () => {
    const response = await request(testApp.http)
      .post('/api/v1/public/estimates')
      .send({ configuration: buildProjectsConfiguration() })
      .expect(200);

    expect(response.body.estimate.totals.usdCents).toBeGreaterThan(0);
  });

  it('generates distinct idempotency keys', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it('shifts version times and keeps the immutability trigger active', async () => {
    const calculation = await testApp.prisma.calculation.create({
      data: {
        publicId: `fixture-${newIdempotencyKey()}`,
        latestVersionNumber: 1,
      },
    });
    const version = await testApp.prisma.calculationVersion.create({
      data: {
        calculationId: calculation.id,
        number: 1,
        snapshot: {},
        snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        pricingVersion: 'fixture',
        totalUsdCents: 1,
        incomplete: false,
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      },
    });
    const expiresAt = new Date('2026-01-01T00:00:00Z');

    await shiftCalculationVersionTimes(testApp.prisma, version.id, {
      expiresAt,
    });

    const shifted = await testApp.prisma.calculationVersion.findUniqueOrThrow({
      where: { id: version.id },
    });
    expect(shifted.expiresAt).toEqual(expiresAt);
    await expect(
      testApp.prisma.calculationVersion.update({
        where: { id: version.id },
        data: { totalUsdCents: 2 },
      }),
    ).rejects.toThrow();
  });
});
