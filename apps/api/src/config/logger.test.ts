import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOGGER_REDACTION } from './logger';

describe('LOGGER_REDACTION', () => {
  it('removes secrets and personal data from structured logs', () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = pino({ redact: LOGGER_REDACTION }, stream);

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'rw_session=secret-cookie',
          'x-maintenance-token': 'maintenance-secret',
        },
        body: {
          password: 'secret-password',
          phone: '+380501234567',
          email: 'person@example.com',
        },
      },
    });

    const output = chunks.join('');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('secret-cookie');
    expect(output).not.toContain('maintenance-secret');
    expect(output).not.toContain('secret-password');
    expect(output).not.toContain('+380501234567');
    expect(output).not.toContain('person@example.com');
    expect(output).toContain('[Redacted]');
  });
});
