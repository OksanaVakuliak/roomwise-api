import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOGGER_REDACTION, pinoHttpOptions } from './logger';

const createStream = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, chunks };
};

const createLogger = (stream: Writable) =>
  pino(
    { redact: LOGGER_REDACTION, serializers: pinoHttpOptions.serializers },
    stream,
  );

const createRequest = (url: string, query: Record<string, string>) => ({
  method: 'GET',
  url,
  query,
  headers: {
    authorization: 'Bearer secret-token',
    cookie: 'rw_session=secret-cookie',
    'x-maintenance-token': 'maintenance-secret',
  },
  socket: { remoteAddress: '127.0.0.1', remotePort: 12345 },
});

describe('logger config', () => {
  it('redacts email and phone leaking through req.url and req.query, and redacts headers', () => {
    const { stream, chunks } = createStream();
    const logger = createLogger(stream);

    logger.info({
      req: createRequest(
        '/api/leads?email=person@example.com&phone=380991234567',
        { email: 'person@example.com', phone: '380991234567' },
      ),
    });

    const output = chunks.join('');
    const logged = JSON.parse(output);

    expect(output).not.toContain('person@example.com');
    expect(output).not.toContain('380991234567');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('secret-cookie');
    expect(output).not.toContain('maintenance-secret');
    expect(logged.req.url).toBe('/api/leads');
    expect(logged.req.query).toEqual({
      email: '[Redacted]',
      phone: '[Redacted]',
    });
    expect(logged.req.headers.authorization).toBe('[Redacted]');
    expect(logged.req.headers.cookie).toBe('[Redacted]');
    expect(logged.req.headers['x-maintenance-token']).toBe('[Redacted]');
  });

  it('keeps non-sensitive query params untouched', () => {
    const { stream, chunks } = createStream();
    const logger = createLogger(stream);

    logger.info({
      req: createRequest('/api/catalog?lang=uk&page=2', {
        lang: 'uk',
        page: '2',
      }),
    });

    const logged = JSON.parse(chunks.join(''));

    expect(logged.req.url).toBe('/api/catalog');
    expect(logged.req.query).toEqual({ lang: 'uk', page: '2' });
  });
});
