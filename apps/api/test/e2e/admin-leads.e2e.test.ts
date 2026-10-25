import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Clock } from '../../src/common/clock/clock';
import { ERROR_CODES } from '../../src/common/http/error-codes';
import { IdempotencyScope, LeadStatus } from '../../src/generated/prisma/enums';
import { createTestApp, type TestApp } from './app-factory';
import { createAdmin, login } from './auth-helpers';
import {
  buildNamedBedroomsConfiguration,
  buildProjectsConfiguration,
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
  shiftCalculationVersionTimes,
  shiftIdempotencyKeyCreatedAt,
  shiftLeadCreatedAt,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const MAINTENANCE_TOKEN = process.env.MAINTENANCE_TOKEN as string;
const MAINTENANCE_PATH = '/api/v1/internal/maintenance/run';
const CALCULATIONS = '/api/v1/public/calculations';
const LEADS = '/api/v1/public/leads';
const ADMIN_LEADS = '/api/v1/admin/leads';
const SETTINGS = '/api/v1/admin/projects/settings';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const IPS_PER_OCTET = 250;
const TOLERANCE_MS = 60_000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const MASK = '•••';
const NOTICE = {
  en: 'We keep your request for {days} days.',
  uk: 'Ми зберігаємо заявку {days} днів.',
};
const PERSON = {
  name: 'Oksana Testova',
  phone: '+380 67 123 45 67',
  email: 'oksana.testova@example.com',
  comment: 'Please call after six',
};
const PHONE_E164 = '+380671234567';

function roomName(room: { name: string }): string {
  return room.name;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

describe('admin leads e2e', () => {
  let testApp: TestApp;
  let adminCookie: string;
  let demoCookie: string;
  let currentPricingVersion: string;
  let now = Date.now();
  let ipCounter = 0;
  let saved: { publicId: string; number: number; versionId: string };

  function freshIp(): string {
    ipCounter += 1;

    return `10.30.${Math.floor(ipCounter / IPS_PER_OCTET)}.${(ipCounter % IPS_PER_OCTET) + 1}`;
  }

  async function saveCalculation() {
    const response = await request(testApp.http)
      .post(CALCULATIONS)
      .set(FORWARDED_FOR_HEADER, freshIp())
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        configuration: buildProjectsConfiguration(),
        styleId: projectsStyleId,
        clientPricingVersion: currentPricingVersion,
        clientTotalUsdCents: 1,
      })
      .expect(201);
    const version = response.body.version as {
      publicId: string;
      number: number;
      expiresAt: string;
    };
    const row = await testApp.prisma.calculationVersion.findFirstOrThrow({
      where: {
        number: version.number,
        calculation: { publicId: version.publicId },
      },
    });

    return { ...version, versionId: row.id };
  }

  async function createLead(
    overrides: Record<string, unknown> = {},
    key = newIdempotencyKey(),
  ): Promise<{ id: string; number: number }> {
    const response = await request(testApp.http)
      .post(LEADS)
      .set(FORWARDED_FOR_HEADER, freshIp())
      .set(IDEMPOTENCY_HEADER, key)
      .send({
        calculation: { publicId: saved.publicId, versionNumber: saved.number },
        ...PERSON,
        consent: { accepted: true, text: 'I agree' },
        locale: 'uk',
        ...overrides,
      })
      .expect(201);
    const lead = await testApp.prisma.lead.findUniqueOrThrow({
      where: { number: response.body.leadNumber },
    });

    return { id: lead.id, number: lead.number };
  }

  function asAdmin(method: Method, path: string) {
    return request(testApp.http)[method](path).set('Cookie', adminCookie);
  }

  function asDemo(method: Method, path: string) {
    return request(testApp.http)[method](path).set('Cookie', demoCookie);
  }

  async function card(id: string) {
    const response = await asAdmin('get', `${ADMIN_LEADS}/${id}`).expect(200);

    return response.body;
  }

  async function setStatus(id: string, status: LeadStatus) {
    const { revision } = await card(id);

    return asAdmin('post', `${ADMIN_LEADS}/${id}/status`).send({
      status,
      revision,
    });
  }

  async function getSettings() {
    const response = await asAdmin('get', SETTINGS).expect(200);

    return response.body;
  }

  async function patchSettings(body: Record<string, unknown>) {
    const { revision } = await getSettings();

    return asAdmin('patch', SETTINGS).send({ ...body, revision });
  }

  async function restoreSettings(original: Record<string, unknown>) {
    const { leadFormNotice, leadRetentionDays, calculationValidityDays } =
      original;

    await patchSettings({
      leadFormNotice,
      leadRetentionDays,
      calculationValidityDays,
    }).then((response) => expect(response.status).toBe(200));
  }

  async function runMaintenance() {
    await request(testApp.http)
      .post(MAINTENANCE_PATH)
      .set('x-maintenance-token', MAINTENANCE_TOKEN)
      .expect(200);
  }

  async function ids(): Promise<string[]> {
    const rows = await testApp.prisma.lead.findMany({ select: { id: true } });

    return rows.map((row) => row.id).sort();
  }

  function countRows() {
    return Promise.all([
      testApp.prisma.lead.count(),
      testApp.prisma.leadNote.count(),
      testApp.prisma.leadStatusChange.count(),
    ]);
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      overrides: [{ provide: Clock, useValue: { now: () => new Date(now) } }],
    });
    await seedProjectsData(testApp);

    const admin = await createAdmin(testApp.prisma);
    adminCookie = await login(testApp.http, admin.login, admin.password);
    const demo = await createAdmin(testApp.prisma, { isDemo: true });
    demoCookie = await login(testApp.http, demo.login, demo.password);

    const pricing = await request(testApp.http)
      .get('/api/v1/public/pricing-data')
      .expect(200);
    currentPricingVersion = pricing.body.version as string;
    saved = await saveCalculation();
  });

  beforeEach(async () => {
    now = Date.now();
    await testApp.prisma.lead.deleteMany();
    await testApp.prisma.projectsSettings.updateMany({
      data: { lastRetentionRunAt: null },
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('list', () => {
    it('requires authentication', async () => {
      await request(testApp.http).get(ADMIN_LEADS).expect(401);
    });

    it('filters by status, newest first, and excludes spam by default', async () => {
      const first = await createLead();
      const second = await createLead();
      const third = await createLead();
      await shiftLeadCreatedAt(
        testApp.prisma,
        first.id,
        new Date(now - 3 * DAY_MS),
      );
      await shiftLeadCreatedAt(
        testApp.prisma,
        second.id,
        new Date(now - 2 * DAY_MS),
      );
      await setStatus(third.id, LeadStatus.SPAM).then((response) =>
        expect(response.status).toBe(200),
      );
      await setStatus(second.id, LeadStatus.IN_PROGRESS).then((response) =>
        expect(response.status).toBe(200),
      );

      const all = await asAdmin('get', ADMIN_LEADS).expect(200);
      const inProgress = await asAdmin(
        'get',
        `${ADMIN_LEADS}?status=${LeadStatus.IN_PROGRESS}`,
      ).expect(200);
      const spam = await asAdmin(
        'get',
        `${ADMIN_LEADS}?status=${LeadStatus.SPAM}`,
      ).expect(200);
      const idsOf = (body: { items: Array<{ id: string }> }) =>
        body.items.map((item) => item.id);

      expect(idsOf(all.body)).toEqual([second.id, first.id]);
      expect(all.body).toMatchObject({ page: 1, total: 2 });
      expect(all.body.pageSize).toEqual(expect.any(Number));
      expect(all.body.items[0]).toEqual({
        id: second.id,
        number: second.number,
        createdAt: expect.any(String),
        status: LeadStatus.IN_PROGRESS,
        name: PERSON.name,
        phone: PHONE_E164,
        email: PERSON.email,
        expiredAtSubmission: false,
        totalUsdCents: expect.any(Number),
        masked: false,
      });
      expect(idsOf(inProgress.body)).toEqual([second.id]);
      expect(idsOf(spam.body)).toEqual([third.id]);
    });

    it('paginates', async () => {
      await createLead();
      await createLead();
      await createLead();

      const page = await asAdmin(
        'get',
        `${ADMIN_LEADS}?page=2&pageSize=2`,
      ).expect(200);

      expect(page.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(page.body.items).toHaveLength(1);
    });

    it('answers 400 for an unknown status', async () => {
      const response = await asAdmin('get', `${ADMIN_LEADS}?status=BOGUS`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });
  });

  describe('card', () => {
    it('returns contacts, history and the full calculation snapshot', async () => {
      const lead = await createLead();
      const body = await card(lead.id);

      expect(body).toMatchObject({
        id: lead.id,
        name: PERSON.name,
        phone: PHONE_E164,
        email: PERSON.email,
        comment: PERSON.comment,
        consentText: 'I agree',
        locale: 'uk',
        status: LeadStatus.NEW,
        expiredAtSubmission: false,
        masked: false,
        notes: [],
      });
      expect(body.revision).toEqual(expect.any(String));
      expect(body.statusHistory).toHaveLength(1);
      expect(body.statusHistory[0]).toMatchObject({
        fromStatus: null,
        toStatus: LeadStatus.NEW,
      });
      expect(body.calculation).toMatchObject({
        publicId: saved.publicId,
        number: saved.number,
        expiresAt: expect.any(String),
      });
      expect(body.calculation).toHaveProperty('priceStatus');
      expect(body.calculation.totals.usdCents).toBe(body.totalUsdCents);
    });

    it('shows the room names of a draft saved with the lead', async () => {
      const lead = await createLead({
        calculation: undefined,
        draft: {
          configuration: buildNamedBedroomsConfiguration(),
          styleId: projectsStyleId,
          clientPricingVersion: currentPricingVersion,
        },
      });
      const body = await card(lead.id);

      expect(
        body.calculation.rooms.map((room: { name: string }) => room.name),
      ).toEqual(['Master bedroom', 'Kids room']);
    });

    it('flags a lead submitted on an expired version', async () => {
      const version = await saveCalculation();
      await shiftCalculationVersionTimes(testApp.prisma, version.versionId, {
        expiresAt: new Date(now - HOUR_MS),
      });

      const lead = await createLead({
        calculation: {
          publicId: version.publicId,
          versionNumber: version.number,
        },
      });
      const body = await card(lead.id);
      const list = await asAdmin('get', ADMIN_LEADS).expect(200);

      expect(body.expiredAtSubmission).toBe(true);
      expect(list.body.items[0].expiredAtSubmission).toBe(true);
    });

    it('answers 404 for an unknown lead', async () => {
      const response = await asAdmin('get', `${ADMIN_LEADS}/${UNKNOWN_ID}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  describe('status', () => {
    it('records the author and appends to the history', async () => {
      const lead = await createLead();
      const before = await card(lead.id);

      const response = await asAdmin(
        'post',
        `${ADMIN_LEADS}/${lead.id}/status`,
      ).send({ status: LeadStatus.IN_PROGRESS, revision: before.revision });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(LeadStatus.IN_PROGRESS);
      expect(response.body.revision).not.toBe(before.revision);
      expect(response.body.statusHistory).toHaveLength(2);
      expect(response.body.statusHistory[0].fromStatus).toBeNull();
      expect(response.body.statusHistory[1]).toMatchObject({
        fromStatus: LeadStatus.NEW,
        toStatus: LeadStatus.IN_PROGRESS,
        changedBy: { login: expect.any(String) },
      });
    });

    it('answers 409 for a stale revision and leaves the status', async () => {
      const lead = await createLead();
      const before = await card(lead.id);
      await asAdmin('post', `${ADMIN_LEADS}/${lead.id}/status`)
        .send({ status: LeadStatus.IN_PROGRESS, revision: before.revision })
        .expect(200);

      const response = await asAdmin(
        'post',
        `${ADMIN_LEADS}/${lead.id}/status`,
      ).send({ status: LeadStatus.DONE, revision: before.revision });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
      expect((await card(lead.id)).status).toBe(LeadStatus.IN_PROGRESS);
    });

    it('answers 422 for the same status', async () => {
      const lead = await createLead();

      const response = await setStatus(lead.id, LeadStatus.NEW);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe(ERROR_CODES.SAME_STATUS);
    });
  });

  describe('notes', () => {
    it('adds notes with the author and keeps their order', async () => {
      const lead = await createLead();

      const first = await asAdmin(
        'post',
        `${ADMIN_LEADS}/${lead.id}/notes`,
      ).send({ text: 'Called, no answer' });
      await asAdmin('post', `${ADMIN_LEADS}/${lead.id}/notes`)
        .send({ text: 'Called again' })
        .expect(201);
      const body = await card(lead.id);

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        text: 'Called, no answer',
        author: { login: expect.any(String) },
      });
      expect(body.notes.map((note: { text: string }) => note.text)).toEqual([
        'Called, no answer',
        'Called again',
      ]);
    });

    it('rejects an empty note', async () => {
      const lead = await createLead();

      const response = await asAdmin(
        'post',
        `${ADMIN_LEADS}/${lead.id}/notes`,
      ).send({ text: '   ' });

      expect(response.status).toBe(400);
    });
  });

  describe('spam and delete', () => {
    it('hides a spam lead from the default list', async () => {
      const lead = await createLead();
      await setStatus(lead.id, LeadStatus.SPAM).then((response) =>
        expect(response.status).toBe(200),
      );

      const list = await asAdmin('get', ADMIN_LEADS).expect(200);

      expect(list.body.total).toBe(0);
      expect(list.body.items).toEqual([]);
    });

    it('deletes a lead with notes and history but keeps the calculation version', async () => {
      const lead = await createLead();
      await asAdmin('post', `${ADMIN_LEADS}/${lead.id}/notes`)
        .send({ text: 'Note' })
        .expect(201);
      await setStatus(lead.id, LeadStatus.IN_PROGRESS).then((response) =>
        expect(response.status).toBe(200),
      );

      await asAdmin('delete', `${ADMIN_LEADS}/${lead.id}`).expect(204);

      await expect(countRows()).resolves.toEqual([0, 0, 0]);
      await expect(
        testApp.prisma.calculationVersion.count({
          where: { id: saved.versionId },
        }),
      ).resolves.toBe(1);
      await asAdmin('get', `${ADMIN_LEADS}/${lead.id}`).expect(404);
      await asAdmin('delete', `${ADMIN_LEADS}/${lead.id}`).expect(404);
    });

    it('drops the idempotency key with the lead so a replay creates a new lead', async () => {
      const key = newIdempotencyKey();
      const first = await createLead({}, key);
      await expect(
        testApp.prisma.idempotencyKey.count({
          where: { scope: IdempotencyScope.LEAD, key },
        }),
      ).resolves.toBe(1);

      await asAdmin('delete', `${ADMIN_LEADS}/${first.id}`).expect(204);

      await expect(
        testApp.prisma.idempotencyKey.count({
          where: { scope: IdempotencyScope.LEAD, key },
        }),
      ).resolves.toBe(0);
      const replay = await createLead({}, key);
      expect(replay.id).not.toBe(first.id);
      await expect(testApp.prisma.lead.count()).resolves.toBe(1);
    });
  });

  describe('settings', () => {
    it('reads the settings', async () => {
      const body = await getSettings();

      expect(body).toMatchObject({
        calculationValidityDays: expect.any(Number),
        leadRetentionDays: expect.any(Number),
        leadFormNotice: { en: expect.any(String), uk: expect.any(String) },
        revision: expect.any(String),
      });
    });

    it.each([0, 366])('answers 400 for %i days', async (days) => {
      const calculation = await patchSettings({
        calculationValidityDays: days,
      });
      const retention = await patchSettings({ leadRetentionDays: days });

      for (const response of [calculation, retention]) {
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      }
    });

    it.each([
      ['en', { en: 'No placeholder', uk: NOTICE.uk }],
      ['uk', { en: NOTICE.en, uk: 'Без плейсхолдера' }],
    ])(
      'answers 422 when the %s notice lacks {days}',
      async (_language, notice) => {
        const before = await getSettings();

        const response = await patchSettings({ leadFormNotice: notice });

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(
          ERROR_CODES.NOTICE_PLACEHOLDER_MISSING,
        );
        expect((await getSettings()).leadFormNotice).toEqual(
          before.leadFormNotice,
        );
      },
    );

    it('answers 409 for a stale revision', async () => {
      const before = await getSettings();
      await asAdmin('patch', SETTINGS)
        .send({
          leadRetentionDays: before.leadRetentionDays,
          revision: before.revision,
        })
        .expect(200);

      const response = await asAdmin('patch', SETTINGS).send({
        leadRetentionDays: 10,
        revision: before.revision,
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ERROR_CODES.STALE_REVISION);
    });

    it('updates the notice and shows it on the public form', async () => {
      const original = await getSettings();

      try {
        const response = await patchSettings({
          leadFormNotice: NOTICE,
          leadRetentionDays: 45,
        });
        const form = await request(testApp.http)
          .get(`${LEADS}/form-settings?lang=en`)
          .expect(200);

        expect(response.status).toBe(200);
        expect(form.body.retentionDays).toBe(45);
        expect(form.body.notice).toBe('We keep your request for 45 days.');
      } finally {
        await restoreSettings(original);
      }
    });

    it('keeps expiresAt of saved versions and applies the new validity to new ones', async () => {
      const original = await getSettings();

      try {
        await patchSettings({ calculationValidityDays: 14 }).then((response) =>
          expect(response.status).toBe(200),
        );
        const before = await saveCalculation();
        await patchSettings({ calculationValidityDays: 30 }).then((response) =>
          expect(response.status).toBe(200),
        );
        const after = await saveCalculation();
        const reread = await request(testApp.http)
          .get(`${CALCULATIONS}/${before.publicId}/versions/${before.number}`)
          .expect(200);

        expect(reread.body.expiresAt).toBe(before.expiresAt);
        expect(
          Math.abs(Date.parse(before.expiresAt) - (now + 14 * DAY_MS)),
        ).toBeLessThan(TOLERANCE_MS);
        expect(
          Math.abs(Date.parse(after.expiresAt) - (now + 30 * DAY_MS)),
        ).toBeLessThan(TOLERANCE_MS);
      } finally {
        await restoreSettings(original);
      }
    });
  });

  describe('retention', () => {
    it('deletes leads older than the retention period and re-reads the setting', async () => {
      const original = await getSettings();

      try {
        await patchSettings({ leadRetentionDays: 30 }).then((response) =>
          expect(response.status).toBe(200),
        );
        const old = await createLead();
        const middle = await createLead();
        const young = await createLead();
        await shiftLeadCreatedAt(
          testApp.prisma,
          old.id,
          new Date(now - 40 * DAY_MS),
        );
        await shiftLeadCreatedAt(
          testApp.prisma,
          middle.id,
          new Date(now - 10 * DAY_MS),
        );
        await shiftLeadCreatedAt(
          testApp.prisma,
          young.id,
          new Date(now - DAY_MS),
        );
        await asAdmin('post', `${ADMIN_LEADS}/${old.id}/notes`)
          .send({ text: 'Old note' })
          .expect(201);

        await runMaintenance();

        expect(await ids()).toEqual([middle.id, young.id].sort());
        await expect(
          testApp.prisma.leadNote.count({ where: { leadId: old.id } }),
        ).resolves.toBe(0);
        const settings = await getSettings();
        expect(settings.lastRetentionRunAt).not.toBeNull();
        expect(
          Math.abs(Date.parse(settings.lastRetentionRunAt) - now),
        ).toBeLessThan(TOLERANCE_MS);

        await patchSettings({ leadRetentionDays: 7 }).then((response) =>
          expect(response.status).toBe(200),
        );
        await runMaintenance();
        expect(await ids()).toEqual([middle.id, young.id].sort());

        await testApp.prisma.projectsSettings.updateMany({
          data: { lastRetentionRunAt: null },
        });
        await runMaintenance();
        expect(await ids()).toEqual([young.id]);
      } finally {
        await restoreSettings(original);
      }
    });

    it('does not move the settings audit fields', async () => {
      const before = await getSettings();

      await runMaintenance();

      const after = await getSettings();
      expect(after.lastRetentionRunAt).not.toBeNull();
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(after.updatedBy).toEqual(before.updatedBy);
    });

    it('runs again once more than 20 hours have passed', async () => {
      const original = await getSettings();

      try {
        await patchSettings({ leadRetentionDays: 30 }).then((response) =>
          expect(response.status).toBe(200),
        );
        await runMaintenance();
        const late = await createLead();
        await shiftLeadCreatedAt(
          testApp.prisma,
          late.id,
          new Date(now - 40 * DAY_MS),
        );

        await runMaintenance();
        await expect(testApp.prisma.lead.count()).resolves.toBe(1);

        await testApp.prisma.projectsSettings.updateMany({
          data: { lastRetentionRunAt: new Date(now - 21 * HOUR_MS) },
        });
        await runMaintenance();
        await expect(testApp.prisma.lead.count()).resolves.toBe(0);
      } finally {
        await restoreSettings(original);
      }
    });

    it('removes idempotency keys older than a day and keeps fresh ones', async () => {
      const staleKey = newIdempotencyKey();
      const freshKey = newIdempotencyKey();
      await createLead({}, staleKey);
      await createLead({}, freshKey);
      await shiftIdempotencyKeyCreatedAt(
        testApp.prisma,
        IdempotencyScope.LEAD,
        staleKey,
        new Date(now - 25 * HOUR_MS),
      );

      await runMaintenance();

      const keys = await testApp.prisma.idempotencyKey.findMany({
        where: {
          scope: IdempotencyScope.LEAD,
          key: { in: [staleKey, freshKey] },
        },
      });
      expect(keys.map((key) => key.key)).toEqual([freshKey]);
    });
  });

  describe('demo admin', () => {
    it('masks contacts in the list and hides private text in the card', async () => {
      const lead = await createLead();
      await asAdmin('post', `${ADMIN_LEADS}/${lead.id}/notes`)
        .send({ text: 'Private note' })
        .expect(201);

      const list = await asDemo('get', ADMIN_LEADS).expect(200);
      const detail = await asDemo('get', `${ADMIN_LEADS}/${lead.id}`).expect(
        200,
      );
      const body = detail.body;

      for (const item of [list.body.items[0], body]) {
        expect(item).toMatchObject({
          masked: true,
          name: `O${MASK}`,
          phone: `+380${MASK}67`,
          email: `o${MASK}@${MASK}.com`,
        });
      }
      expect(body.comment).toBeNull();
      expect(body.consentText).toBeNull();
      expect(body.notes).toHaveLength(1);
      expect(body.notes[0].text).toBeNull();
      expect(body.calculation).toMatchObject({
        publicId: MASK,
        totals: { usdCents: expect.any(Number) },
      });
      expect(JSON.stringify(body)).not.toContain(saved.publicId);
      const serialized = JSON.stringify(body);
      for (const secret of [
        PERSON.name,
        PERSON.email,
        PERSON.comment,
        'Private note',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('replaces custom room names with room type names', async () => {
      const lead = await createLead({
        calculation: undefined,
        draft: {
          configuration: buildNamedBedroomsConfiguration(),
          styleId: projectsStyleId,
          clientPricingVersion: currentPricingVersion,
        },
      });

      const demoCard = (
        await asDemo('get', `${ADMIN_LEADS}/${lead.id}`).expect(200)
      ).body;
      const adminCard = await card(lead.id);

      expect(demoCard.calculation.rooms.map(roomName)).toEqual(
        demoCard.calculation.rooms.map(
          (room: { roomTypeName: string }) => room.roomTypeName,
        ),
      );
      expect(JSON.stringify(demoCard)).not.toMatch(/Master bedroom|Kids room/);
      expect(demoCard.calculation.publicId).toBe(MASK);
      expect(adminCard.calculation.publicId).not.toBe(MASK);
      expect(adminCard.calculation.publicId).toEqual(expect.any(String));
      expect(JSON.stringify(adminCard)).toContain('Master bedroom');
    });

    it('answers 403 DEMO_FORBIDDEN for every write and changes nothing', async () => {
      const lead = await createLead();
      const { revision } = await card(lead.id);
      const settings = await getSettings();
      const before = await countRows();

      const responses = await Promise.all([
        asDemo('post', `${ADMIN_LEADS}/${lead.id}/status`).send({
          status: LeadStatus.DONE,
          revision,
        }),
        asDemo('post', `${ADMIN_LEADS}/${lead.id}/notes`).send({
          text: 'Nope',
        }),
        asDemo('delete', `${ADMIN_LEADS}/${lead.id}`),
        asDemo('patch', SETTINGS).send({
          leadRetentionDays: 5,
          revision: settings.revision,
        }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(ERROR_CODES.DEMO_FORBIDDEN);
      }
      await expect(countRows()).resolves.toEqual(before);
      expect(await card(lead.id)).toMatchObject({
        status: LeadStatus.NEW,
        revision,
      });
      expect(await getSettings()).toEqual(settings);
    });

    it('lets the demo admin read the settings', async () => {
      await asDemo('get', SETTINGS).expect(200);
    });
  });
});
