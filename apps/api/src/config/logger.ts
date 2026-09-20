import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';

export const LOGGER_REDACTION = {
  paths: [
    'authorization',
    'cookie',
    'password',
    'phone',
    'email',
    '*.authorization',
    '*.cookie',
    '*.password',
    '*.phone',
    '*.email',
    'req.headers.authorization',
    'req.headers.cookie',
    "req.headers['x-maintenance-token']",
    'req.body.password',
    'req.body.currentPassword',
    'req.body.newPassword',
    'req.body.phone',
    'req.body.email',
    "res.headers['set-cookie']",
  ],
  censor: '[Redacted]',
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
};
