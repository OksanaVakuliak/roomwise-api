import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pinoHttpOptions } from '../../src/config/logger';
import { createTestApp, type TestApp } from './app-factory';
import {
  buildProjectsConfiguration,
  newIdempotencyKey,
  projectsStyleId,
  seedProjectsData,
} from './projects-fixtures';

const SEED_TIMEOUT_MS = 120_000;
const PUBLIC_PREFIX = '/api/v1/public/';
const CALCULATIONS = '/api/v1/public/calculations';
const LEADS = '/api/v1/public/leads';
const PINO_PARAMS_TOKEN = 'pino-params';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const REQUEST_ID_HEADER = 'x-request-id';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const CONTACT_PROPERTIES = ['phone', 'email', 'comment'];
const PERSON_PATH_PREFIXES = [CALCULATIONS, LEADS];
const CATALOG_NAME_OWNERS = ['style', 'rooms', 'product'];
const PHONE_LOCAL = '+380 67 123 45 67';
const PHONE_DIGITS = '380671234567';
const INVALID_PHONE = '+380 00 000 00 00';
const INVALID_PHONE_DIGITS = '380000000000';
const EMAIL = 'privacy.probe@example.com';
const PERSON_NAME = 'Privacy Probe';
const COMMENT = 'Call me after six in the evening';
const CONSENT_TEXT = 'I agree to the processing of my data';
const SENSITIVE_VALUES = [
  PHONE_LOCAL,
  PHONE_DIGITS,
  EMAIL,
  PERSON_NAME,
  COMMENT,
];

type JsonObject = Record<string, unknown>;

interface OpenApiDocument {
  paths: Record<string, Record<string, JsonObject>>;
}

interface PropertyHit {
  name: string;
  pointer: string;
  owner: string | null;
}

interface WalkScope {
  refStack: string[];
  owner: string | null;
}

vi.setConfig({ hookTimeout: SEED_TIMEOUT_MS, testTimeout: SEED_TIMEOUT_MS });

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function resolveRef(document: OpenApiDocument, ref: string): unknown {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>(
      (node, segment) =>
        isObject(node)
          ? node[segment.replace(/~1/g, '/').replace(/~0/g, '~')]
          : undefined,
      document,
    );
}

function collectProperties(
  document: OpenApiDocument,
  node: unknown,
  pointer: string,
  scope: WalkScope,
  hits: PropertyHit[],
): void {
  if (!isObject(node)) {
    return;
  }

  if (typeof node.$ref === 'string') {
    if (!scope.refStack.includes(node.$ref)) {
      collectProperties(
        document,
        resolveRef(document, node.$ref),
        node.$ref,
        { ...scope, refStack: [...scope.refStack, node.$ref] },
        hits,
      );
    }

    return;
  }

  if (isObject(node.properties)) {
    for (const [name, child] of Object.entries(node.properties)) {
      const childPointer = `${pointer}/properties/${name}`;

      hits.push({ name, pointer: childPointer, owner: scope.owner });
      collectProperties(
        document,
        child,
        childPointer,
        { ...scope, owner: name },
        hits,
      );
    }
  }

  collectProperties(document, node.items, `${pointer}/items`, scope, hits);
  collectProperties(
    document,
    node.additionalProperties,
    `${pointer}/additionalProperties`,
    scope,
    hits,
  );

  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    const variants = node[keyword];

    if (Array.isArray(variants)) {
      variants.forEach((variant, index) => {
        collectProperties(
          document,
          variant,
          `${pointer}/${keyword}/${index}`,
          scope,
          hits,
        );
      });
    }
  }
}

function jsonSchemaOf(document: OpenApiDocument, rawResponse: unknown) {
  const response =
    isObject(rawResponse) && typeof rawResponse.$ref === 'string'
      ? resolveRef(document, rawResponse.$ref)
      : rawResponse;
  const content = isObject(response) ? response.content : undefined;
  const json = isObject(content) ? content['application/json'] : undefined;

  return isObject(json) ? json.schema : undefined;
}

function publicResponseProperties(
  document: OpenApiDocument,
): Map<string, PropertyHit[]> {
  const byPath = new Map<string, PropertyHit[]>();

  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith(PUBLIC_PREFIX)) {
      continue;
    }

    const hits: PropertyHit[] = [];

    for (const [method, operation] of Object.entries(item)) {
      const responses = isObject(operation.responses)
        ? operation.responses
        : {};

      for (const [status, response] of Object.entries(responses)) {
        collectProperties(
          document,
          jsonSchemaOf(document, response),
          `#/paths/${path}/${method}/responses/${status}/content/application~1json/schema`,
          { refStack: [], owner: null },
          hits,
        );
      }
    }

    byPath.set(path, hits);
  }

  return byPath;
}

function findViolations(
  byPath: Map<string, PropertyHit[]>,
  isForbidden: (path: string, hit: PropertyHit) => boolean,
): string[] {
  return [...byPath.entries()].flatMap(([path, hits]) =>
    hits
      .filter((hit) => isForbidden(path, hit))
      .map((hit) => `${path}: ${hit.pointer}`),
  );
}

describe('privacy: public OpenAPI response schemas', () => {
  const document = JSON.parse(
    readFileSync(resolve(__dirname, '../../openapi.json'), 'utf8'),
  ) as OpenApiDocument;
  const byPath = publicResponseProperties(document);

  it('scans the public paths', () => {
    expect(byPath.has(LEADS)).toBe(true);
    expect([...byPath.values()].some((hits) => hits.length > 0)).toBe(true);
  });

  it('exposes no phone, email or comment property in any public response', () => {
    const violations = findViolations(byPath, (_path, hit) =>
      CONTACT_PROPERTIES.includes(hit.name),
    );

    expect(violations).toEqual([]);
  });

  it('exposes no person name in public calculation and lead responses', () => {
    const violations = findViolations(
      byPath,
      (path, hit) =>
        hit.name === 'name' &&
        !CATALOG_NAME_OWNERS.includes(hit.owner ?? '') &&
        PERSON_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)),
    );

    expect(violations).toEqual([]);
  });
});

describe('privacy: logs redact lead contact data', () => {
  let testApp: TestApp;
  let saved: { publicId: string; number: number };
  const lines: string[] = [];

  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });

  async function logLinesFor(requestId: string): Promise<string[]> {
    await vi.waitFor(() => {
      expect(lines.some((line) => line.includes(requestId))).toBe(true);
    });

    return lines.filter((line) => line.includes(requestId));
  }

  function expectNoSensitiveValues(output: string) {
    for (const value of SENSITIVE_VALUES) {
      expect(output).not.toContain(value);
    }
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      overrides: [
        {
          provide: PINO_PARAMS_TOKEN,
          useValue: { pinoHttp: { ...pinoHttpOptions, stream: logStream } },
        },
      ],
    });
    await seedProjectsData(testApp);

    const pricing = await request(testApp.http)
      .get('/api/v1/public/pricing-data')
      .expect(200);

    const created = await request(testApp.http)
      .post(CALCULATIONS)
      .set(FORWARDED_FOR_HEADER, '10.77.0.3')
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        configuration: buildProjectsConfiguration(),
        styleId: projectsStyleId,
        clientPricingVersion: pricing.body.version,
        clientTotalUsdCents: 1,
      })
      .expect(201);
    saved = {
      publicId: created.body.version.publicId,
      number: created.body.version.number,
    };
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('keeps phone, email, name and comment out of the log for a lead submission', async () => {
    const requestId = `privacy-lead-${newIdempotencyKey()}`;

    const response = await request(testApp.http)
      .post(LEADS)
      .set(FORWARDED_FOR_HEADER, '10.77.0.1')
      .set(REQUEST_ID_HEADER, requestId)
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        calculation: { publicId: saved.publicId, versionNumber: saved.number },
        name: PERSON_NAME,
        email: EMAIL,
        phone: PHONE_LOCAL,
        comment: COMMENT,
        consent: { accepted: true, text: CONSENT_TEXT },
        locale: 'uk',
      });

    expect(response.status).toBe(201);

    await logLinesFor(requestId);

    expectNoSensitiveValues(lines.join('\n'));
  });

  it('keeps contact data out of the log for a rejected lead submission', async () => {
    const requestId = `privacy-rejected-${newIdempotencyKey()}`;

    const response = await request(testApp.http)
      .post(LEADS)
      .set(FORWARDED_FOR_HEADER, '10.77.0.4')
      .set(REQUEST_ID_HEADER, requestId)
      .set(IDEMPOTENCY_HEADER, newIdempotencyKey())
      .send({
        calculation: { publicId: saved.publicId, versionNumber: saved.number },
        name: PERSON_NAME,
        email: EMAIL,
        phone: INVALID_PHONE,
        comment: COMMENT,
        consent: { accepted: true, text: CONSENT_TEXT },
        locale: 'uk',
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PHONE_INVALID');

    const output = (await logLinesFor(requestId)).join('\n');

    expectNoSensitiveValues(output);
    expect(output).not.toContain(INVALID_PHONE);
    expect(output).not.toContain(INVALID_PHONE_DIGITS);
  });

  it('censors phone and email passed as query parameters', async () => {
    const requestId = `privacy-query-${newIdempotencyKey()}`;

    const response = await request(testApp.http)
      .get(
        `${LEADS}/form-settings?lang=uk&email=${encodeURIComponent(EMAIL)}&phone=${encodeURIComponent(PHONE_LOCAL)}`,
      )
      .set(FORWARDED_FOR_HEADER, '10.77.0.2')
      .set(REQUEST_ID_HEADER, requestId);

    expect(response.status).toBe(200);

    const requestLines = await logLinesFor(requestId);
    const output = requestLines.join('\n');

    expectNoSensitiveValues(output);
    expect(output).not.toContain(encodeURIComponent(EMAIL));
    expect(output).not.toContain(encodeURIComponent(PHONE_LOCAL));

    const queries = requestLines
      .map((line) => (JSON.parse(line) as { req?: { query?: JsonObject } }).req)
      .flatMap((req) => (req?.query ? [req.query] : []));

    expect(queries.length).toBeGreaterThan(0);

    for (const query of queries) {
      expect(query.email).toBe('[Redacted]');
      expect(query.phone).toBe('[Redacted]');
    }
  });
});
