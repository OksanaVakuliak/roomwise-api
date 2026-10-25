import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Clock } from '../../src/common/clock/clock';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { PUBLIC_WRITE_LIMITS_PER_HOUR } from '../../src/common/throttling/public-write-throttle.constants';
import { LeadStatus, Locale } from '../../src/generated/prisma/enums';
import { createTestApp, type TestApp } from './app-factory';
import {
  buildNamedBedroomsConfiguration,
  buildProjectsConfiguration,
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const CALCULATIONS = '/api/v1/public/calculations';
const LEADS = '/api/v1/public/leads';
const FORM_SETTINGS = `${LEADS}/form-settings`;
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const LEADS_LIMIT = PUBLIC_WRITE_LIMITS_PER_HOUR.leads;
const UNKNOWN_PUBLIC_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const UNKNOWN_VERSION_NUMBER = 99;
const MS_PER_DAY = 86_400_000;
const PAST_EXPIRY_DAYS = 15;
const IPS_PER_OCTET = 250;
const PHONE_LOCAL = '+380 67 123 45 67';
const PHONE_E164 = '+380671234567';
const CONSENT_TEXT = 'I agree to the processing of my data';
const PERSONAL = {
  name: 'Oksana Testova',
  email: 'oksana.testova@example.com',
  comment: 'Please call after six in the evening',
};

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

describe('leads e2e', () => {
  let testApp: TestApp;
  let currentPricingVersion: string;
  let now = Date.now();
  let ipCounter = 0;
  let saved: { publicId: string; number: number };

  function freshIp(): string {
    ipCounter += 1;

    return `10.20.${Math.floor(ipCounter / IPS_PER_OCTET)}.${(ipCounter % IPS_PER_OCTET) + 1}`;
  }

  function leadBody(overrides: Record<string, unknown> = {}) {
    return {
      calculation: { publicId: saved.publicId, versionNumber: saved.number },
      ...PERSONAL,
      phone: PHONE_LOCAL,
      consent: { accepted: true, text: CONSENT_TEXT },
      locale: 'uk',
      ...overrides,
    };
  }

  function draft() {
    return {
      configuration: buildProjectsConfiguration(),
      styleId: projectsStyleId,
      clientPricingVersion: currentPricingVersion,
    };
  }

  function submit(
    body: object,
    options: { ip?: string; key?: string | null } = {},
  ) {
    const { ip = freshIp(), key = newIdempotencyKey() } = options;
    const req = request(testApp.http).post(LEADS).set(FORWARDED_FOR_HEADER, ip);

    return (key === null ? req : req.set(IDEMPOTENCY_HEADER, key)).send(body);
  }

  function formSettings(lang: string) {
    return request(testApp.http).get(`${FORM_SETTINGS}?lang=${lang}`);
  }

  function findLead(number: number) {
    return testApp.prisma.lead.findUnique({
      where: { number },
      include: { statusChanges: true },
    });
  }

  async function submitUntilLimit(ip: string): Promise<string[]> {
    const keys = Array.from({ length: LEADS_LIMIT }, () => newIdempotencyKey());

    for (const key of keys) {
      expect((await submit(leadBody(), { ip, key })).status).toBe(201);
    }

    return keys;
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

    const created = await request(testApp.http)
      .post(CALCULATIONS)
      .set(FORWARDED_FOR_HEADER, freshIp())
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({ ...draft(), clientTotalUsdCents: 1 })
      .expect(201);
    saved = {
      publicId: created.body.version.publicId,
      number: created.body.version.number,
    };
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('POST /api/v1/public/leads', () => {
    it('creates a lead on a saved version', async () => {
      const response = await submit(leadBody());

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        leadNumber: expect.any(Number),
        calculation: { publicId: saved.publicId, versionNumber: saved.number },
        expiredAtSubmission: false,
      });

      const lead = await findLead(response.body.leadNumber);

      expect(lead).toMatchObject({
        name: PERSONAL.name,
        phone: PHONE_E164,
        email: PERSONAL.email,
        comment: PERSONAL.comment,
        consentText: CONSENT_TEXT,
        locale: Locale.UK,
        status: LeadStatus.NEW,
        expiredAtSubmission: false,
      });
      expect(lead?.statusChanges).toHaveLength(1);
      expect(lead?.statusChanges[0]).toMatchObject({
        fromStatus: null,
        toStatus: LeadStatus.NEW,
      });
    });

    it('saves a draft as version 1 and links the lead to it', async () => {
      const response = await submit(
        leadBody({ calculation: undefined, draft: draft() }),
      );

      expect(response.status).toBe(201);
      expect(response.body.calculation.versionNumber).toBe(1);
      expect(response.body.calculation.publicId).not.toBe(saved.publicId);

      const version = await request(testApp.http).get(
        `${CALCULATIONS}/${response.body.calculation.publicId}`,
      );
      const lead = await findLead(response.body.leadNumber);
      const linked = await testApp.prisma.calculationVersion.findUniqueOrThrow({
        where: { id: lead?.calculationVersionId },
      });

      expect(version.status).toBe(200);
      expect(version.body.number).toBe(1);
      expect(linked.number).toBe(1);
    });

    it('saves a draft with room names', async () => {
      const response = await submit(
        leadBody({
          calculation: undefined,
          draft: {
            ...draft(),
            configuration: buildNamedBedroomsConfiguration(),
          },
        }),
      );
      expect(response.status).toBe(201);

      const version = await request(testApp.http).get(
        `${CALCULATIONS}/${response.body.calculation.publicId}`,
      );

      expect(
        version.body.rooms.map((room: { name: string }) => room.name),
      ).toEqual(['Master bedroom', 'Kids room']);
    });

    it('rejects a draft with a too long room name', async () => {
      const configuration = buildNamedBedroomsConfiguration();
      configuration.rooms[0].name = 'a'.repeat(61);

      const response = await submit(
        leadBody({
          calculation: undefined,
          draft: { ...draft(), configuration },
        }),
      );

      expect(response.status).toBe(400);
    });

    it('rejects a lead without consent and phone', async () => {
      const { phone: _phone, ...withoutPhone } = leadBody();
      const response = await submit({
        ...withoutPhone,
        consent: { accepted: false, text: CONSENT_TEXT },
      });
      const paths = response.body.error.fields.map(
        (field: { path: string }) => field.path,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(paths).toEqual(
        expect.arrayContaining(['consent.accepted', 'phone']),
      );
    });

    it('rejects a lead with no consent object', async () => {
      const { consent: _consent, ...withoutConsent } = leadBody();
      const response = await submit(withoutConsent);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it.each(['+38067', '0671234567'])(
      'answers 422 PHONE_INVALID for phone %s',
      async (phone) => {
        const marker = `phone-invalid-${phone}`;
        const response = await submit(leadBody({ phone, comment: marker }));

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('PHONE_INVALID');
        await expect(
          testApp.prisma.lead.count({ where: { comment: marker } }),
        ).resolves.toBe(0);
      },
    );

    it('answers 201 for a honeypot without creating a lead', async () => {
      const ip = freshIp();
      const first = await submit(leadBody(), { ip });
      const spam = await submit(leadBody({ website: 'http://spam' }), { ip });
      const next = await submit(leadBody(), { ip });

      expect(spam.status).toBe(201);
      expect(Object.keys(spam.body).sort()).toEqual(
        Object.keys(first.body).sort(),
      );
      expect(spam.body.leadNumber).toEqual(expect.any(Number));
      expect(spam.body.expiredAtSubmission).toBe(false);
      await expect(findLead(spam.body.leadNumber)).resolves.toBeNull();
      expect(spam.body.leadNumber).toBeGreaterThan(first.body.leadNumber);
      expect(next.body.leadNumber).toBeGreaterThan(spam.body.leadNumber);
    });

    it('marks a lead on an expired version', async () => {
      const startedAt = now;

      try {
        now = startedAt + PAST_EXPIRY_DAYS * MS_PER_DAY;
        const response = await submit(leadBody());

        expect(response.status).toBe(201);
        expect(response.body.expiredAtSubmission).toBe(true);
        await expect(findLead(response.body.leadNumber)).resolves.toMatchObject(
          { expiredAtSubmission: true },
        );
      } finally {
        now = startedAt;
      }
    });

    it('answers 404 for an unknown calculation or version', async () => {
      const unknownCalculation = await submit(
        leadBody({
          calculation: { publicId: UNKNOWN_PUBLIC_ID, versionNumber: 1 },
        }),
      );
      const unknownVersion = await submit(
        leadBody({
          calculation: {
            publicId: saved.publicId,
            versionNumber: UNKNOWN_VERSION_NUMBER,
          },
        }),
      );

      for (const response of [unknownCalculation, unknownVersion]) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe(
          ERROR_CODES.CALCULATION_NOT_FOUND,
        );
      }
    });

    it.each([
      ['both calculation and draft', () => ({ draft: draft() })],
      ['neither calculation nor draft', () => ({ calculation: undefined })],
    ])('answers 400 for %s', async (_name, overrides) => {
      const response = await submit(leadBody(overrides()));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });
  });

  describe('idempotency', () => {
    it('replays the first response and creates one lead', async () => {
      const ip = freshIp();
      const key = newIdempotencyKey();
      const comment = `replay-${key}`;
      const body = leadBody({ comment });

      const first = await submit(body, { ip, key });
      const replay = await submit(body, { ip, key });

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(first.body);
      await expect(
        testApp.prisma.lead.count({ where: { comment } }),
      ).resolves.toBe(1);
    });

    it('answers 422 when the key is reused with another body', async () => {
      const ip = freshIp();
      const key = newIdempotencyKey();
      await submit(leadBody(), { ip, key });

      const response = await submit(leadBody({ name: 'Another Name' }), {
        ip,
        key,
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    });

    it('answers 428 without the key', async () => {
      const response = await submit(leadBody(), { key: null });

      expect(response.status).toBe(428);
      expect(response.body.error.code).toBe(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      );
    });
  });

  describe('rate limit', () => {
    it('answers 429 for the sixth lead within an hour from one IP', async () => {
      const ip = freshIp();
      await submitUntilLimit(ip);

      const response = await submit(leadBody(), { ip });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    });

    it('does not spend the leads budget on a replay', async () => {
      const ip = freshIp();
      const [firstKey] = await submitUntilLimit(ip);

      const replay = await submit(leadBody(), { ip, key: firstKey });
      const blocked = await submit(leadBody(), { ip });

      expect(replay.status).toBe(201);
      expect(replay.body.leadNumber).toEqual(expect.any(Number));
      expect(blocked.status).toBe(429);
    });

    it('keeps the budget per client IP', async () => {
      await submitUntilLimit(freshIp());

      const other = await submit(leadBody());

      expect(other.status).toBe(201);
    });
  });

  describe('privacy', () => {
    it('exposes no personal data on public calculation routes', async () => {
      const lead = await submit(leadBody());
      expect(lead.status).toBe(201);

      const responses = await Promise.all([
        request(testApp.http).get(`${CALCULATIONS}/${saved.publicId}`),
        request(testApp.http).get(
          `${CALCULATIONS}/${saved.publicId}/versions/${saved.number}`,
        ),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(200);
        const serialized = JSON.stringify(response.body);

        for (const value of [
          PERSONAL.name,
          PERSONAL.email,
          PERSONAL.comment,
          PHONE_E164,
          PHONE_LOCAL,
          CONSENT_TEXT,
        ]) {
          expect(serialized).not.toContain(value);
        }
      }
    });
  });

  describe('GET /api/v1/public/leads/form-settings', () => {
    it('returns the localized notice with the retention days substituted', async () => {
      const [uk, en] = await Promise.all([
        formSettings('uk'),
        formSettings('en'),
      ]);

      for (const response of [uk, en]) {
        expect(response.status).toBe(200);
        expect(response.body.retentionDays).toEqual(expect.any(Number));
        expect(response.body.notice).toContain(
          String(response.body.retentionDays),
        );
        expect(response.body.notice).not.toContain('{days}');
      }

      expect(uk.body.retentionDays).toBe(en.body.retentionDays);
      expect(uk.body.notice).not.toBe(en.body.notice);
    });
  });
});
