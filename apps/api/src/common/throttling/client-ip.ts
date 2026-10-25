import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const PROXY_SECRET_HEADER = 'x-roomwise-proxy-secret';
export const VERCEL_FORWARDED_FOR_HEADER = 'x-vercel-forwarded-for';

export interface ClientIpRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function resolveVercelClientIp(
  request: ClientIpRequest,
  proxySecret: string | undefined,
): string | undefined {
  if (!proxySecret) {
    return undefined;
  }

  const providedSecret = firstHeaderValue(request.headers[PROXY_SECRET_HEADER]);

  if (!providedSecret || !secretsMatch(providedSecret, proxySecret)) {
    return undefined;
  }

  const candidate = firstHeaderValue(
    request.headers[VERCEL_FORWARDED_FOR_HEADER],
  )
    ?.split(',')[0]
    ?.trim();

  return candidate && isIP(candidate) !== 0 ? candidate : undefined;
}

export function resolveClientIp(
  request: ClientIpRequest,
  proxySecret: string | undefined,
): string {
  return (
    resolveVercelClientIp(request, proxySecret) ??
    request.ip ??
    request.socket?.remoteAddress ??
    ''
  );
}
