import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import type { Options } from 'pino-http';

export const LOGGER_SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'currentPassword',
  'newPassword',
  'phone',
  'email',
  'token',
] as const;

export const LOGGER_REDACTION = {
  paths: [
    ...LOGGER_SENSITIVE_KEYS,
    ...LOGGER_SENSITIVE_KEYS.map((key) => `*.${key}`),
    'req.headers.authorization',
    'req.headers.cookie',
    "req.headers['x-maintenance-token']",
    "res.headers['set-cookie']",
  ],
  censor: '[Redacted]',
};

const isSensitiveQueryKey = (key: string): boolean =>
  (LOGGER_SENSITIVE_KEYS as readonly string[]).includes(key);

const redactQuery = (query: Record<string, string>): Record<string, string> => {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    redacted[key] = isSensitiveQueryKey(key) ? LOGGER_REDACTION.censor : value;
  }
  return redacted;
};

type RequestWithQuery = IncomingMessage & { query?: Record<string, string> };

const serializeRequest = (request: RequestWithQuery) => {
  const serialized = pino.stdSerializers.req(request);
  const { query, url, ...rest } = serialized;
  const sanitized: Record<string, unknown> = {
    ...rest,
    url: url.split('?')[0],
  };

  if (query && typeof query === 'object') {
    sanitized.query = redactQuery(query);
  }

  return sanitized;
};

export const pinoHttpOptions: Options<IncomingMessage, ServerResponse> = {
  genReqId: (request, response) => {
    const requestId = request.headers['x-request-id'];
    const id =
      typeof requestId === 'string' && requestId.trim()
        ? requestId
        : randomUUID();

    response.setHeader('x-request-id', id);
    return id;
  },
  redact: LOGGER_REDACTION,
  serializers: {
    req: serializeRequest,
  },
};
