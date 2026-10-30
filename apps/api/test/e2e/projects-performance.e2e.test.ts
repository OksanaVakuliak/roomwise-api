import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';
import {
  buildProjectsConfiguration,
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const SAVE_MAX_MS = 3000;
const LEAD_CARD_MAX_MS = 500;
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const CALCULATIONS = '/api/v1/public/calculations';

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

describe('projects performance e2e (SC-001, SC-006)', () => {
  let testApp: TestApp;
  let currentPricingVersion: string;
  let ipCounter = 0;

  function freshIp(): string {
    ipCounter += 1;

    return `10.50.0.${ipCounter}`;
  }

  function saveCalculation() {
    return request(testApp.http)
      .post(CALCULATIONS)
      .set(FORWARDED_FOR_HEADER, freshIp())
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        configuration: buildProjectsConfiguration(),
        styleId: projectsStyleId,
        clientPricingVersion: currentPricingVersion,
        clientTotalUsdCents: 1,
      });
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedProjectsData(testApp);
    const pricing = await request(testApp.http)
      .get('/api/v1/public/pricing-data')
      .expect(200);
    currentPricingVersion = pricing.body.version as string;
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('SC-001: saves a calculation on seeded data in under 3s', async () => {
    const start = performance.now();
    const response = await saveCalculation();
    const elapsedMs = performance.now() - start;

    expect(response.status).toBe(201);
    expect(elapsedMs).toBeLessThan(SAVE_MAX_MS);
  });

  it('SC-006: returns the admin lead card with the snapshot in under 500ms', async () => {
    const admin = await createAdmin(testApp.prisma);
    const cookie = await login(testApp.http, admin.login, admin.password);
    const saved = await saveCalculation();
    expect(saved.status).toBe(201);
    const { publicId, number } = saved.body.version as {
      publicId: string;
      number: number;
    };
    const created = await request(testApp.http)
      .post('/api/v1/public/leads')
      .set(FORWARDED_FOR_HEADER, freshIp())
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        calculation: { publicId, versionNumber: number },
        name: 'Oksana Testova',
        phone: '+380 67 123 45 67',
        email: 'oksana.testova@example.com',
        consent: { accepted: true, text: 'I agree' },
        locale: 'uk',
      })
      .expect(201);
    const lead = await testApp.prisma.lead.findUniqueOrThrow({
      where: { number: created.body.leadNumber },
    });

    const start = performance.now();
    const response = await request(testApp.http)
      .get(`/api/v1/admin/leads/${lead.id}`)
      .set('Cookie', cookie);
    const elapsedMs = performance.now() - start;

    expect(response.status).toBe(200);
    expect(response.body.calculation.publicId).toBe(publicId);
    expect(elapsedMs).toBeLessThan(LEAD_CARD_MAX_MS);
  });
});
