import { describe, expect, it } from 'vitest';
import {
  type ClientIpRequest,
  PROXY_SECRET_HEADER,
  resolveClientIp,
  VERCEL_FORWARDED_FOR_HEADER,
} from './client-ip';

const SECRET = 's'.repeat(32);
const SOCKET_IP = '10.0.0.7';
const VERCEL_CLIENT_IP = '203.0.113.9';

function buildRequest(headers: ClientIpRequest['headers']): ClientIpRequest {
  return { ip: SOCKET_IP, headers, socket: { remoteAddress: '10.9.9.9' } };
}

describe('resolveClientIp', () => {
  it('returns the Vercel client address when the secret matches', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: SECRET,
      [VERCEL_FORWARDED_FOR_HEADER]: VERCEL_CLIENT_IP,
    });

    expect(resolveClientIp(request, SECRET)).toBe(VERCEL_CLIENT_IP);
  });

  it('takes the first entry of a multi-value Vercel header', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: SECRET,
      [VERCEL_FORWARDED_FOR_HEADER]: ` ${VERCEL_CLIENT_IP} , 198.51.100.1`,
    });

    expect(resolveClientIp(request, SECRET)).toBe(VERCEL_CLIENT_IP);
  });

  it('accepts IPv6 addresses', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: SECRET,
      [VERCEL_FORWARDED_FOR_HEADER]: '2001:db8::1',
    });

    expect(resolveClientIp(request, SECRET)).toBe('2001:db8::1');
  });

  it('handles array-valued headers', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: [SECRET],
      [VERCEL_FORWARDED_FOR_HEADER]: [VERCEL_CLIENT_IP],
    });

    expect(resolveClientIp(request, SECRET)).toBe(VERCEL_CLIENT_IP);
  });

  it('ignores the Vercel header when the secret is wrong', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: 'w'.repeat(32),
      [VERCEL_FORWARDED_FOR_HEADER]: VERCEL_CLIENT_IP,
    });

    expect(resolveClientIp(request, SECRET)).toBe(SOCKET_IP);
  });

  it('ignores the Vercel header when the secret has a different length', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: 'short',
      [VERCEL_FORWARDED_FOR_HEADER]: VERCEL_CLIENT_IP,
    });

    expect(resolveClientIp(request, SECRET)).toBe(SOCKET_IP);
  });

  it('ignores a spoofed Vercel header sent without the secret', () => {
    const request = buildRequest({
      [VERCEL_FORWARDED_FOR_HEADER]: '6.6.6.6',
    });

    expect(resolveClientIp(request, SECRET)).toBe(SOCKET_IP);
  });

  it('ignores the Vercel header when no secret is configured', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: SECRET,
      [VERCEL_FORWARDED_FOR_HEADER]: VERCEL_CLIENT_IP,
    });

    expect(resolveClientIp(request, undefined)).toBe(SOCKET_IP);
  });

  it('falls back when the Vercel header is not an IP address', () => {
    const request = buildRequest({
      [PROXY_SECRET_HEADER]: SECRET,
      [VERCEL_FORWARDED_FOR_HEADER]: 'not-an-ip',
    });

    expect(resolveClientIp(request, SECRET)).toBe(SOCKET_IP);
  });

  it('falls back to the socket address and then to an empty string', () => {
    expect(
      resolveClientIp(
        { headers: {}, socket: { remoteAddress: '10.9.9.9' } },
        undefined,
      ),
    ).toBe('10.9.9.9');
    expect(resolveClientIp({ headers: {} }, undefined)).toBe('');
  });
});
