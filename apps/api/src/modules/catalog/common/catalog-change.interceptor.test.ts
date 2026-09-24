import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, type Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogCache } from '../public/catalog-cache';
import { CatalogChangeInterceptor } from './catalog-change.interceptor';

function createContext(method: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method }),
    }),
  } as unknown as ExecutionContext;
}

function createHandler(observable: Observable<unknown>): CallHandler {
  return {
    handle: () => observable,
  } as CallHandler;
}

function createCatalogCache(): CatalogCache {
  return {
    invalidate: vi.fn(),
  } as unknown as CatalogCache;
}

describe('CatalogChangeInterceptor', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'invalidates the catalog cache after a successful %s',
    async (method) => {
      const catalogCache = createCatalogCache();
      const interceptor = new CatalogChangeInterceptor(catalogCache);
      const handler = createHandler(of('result'));

      const result = await firstValueFrom(
        interceptor.intercept(createContext(method), handler),
      );

      expect(result).toBe('result');
      expect(catalogCache.invalidate).toHaveBeenCalledTimes(1);
    },
  );

  it('does not invalidate the catalog cache on GET', async () => {
    const catalogCache = createCatalogCache();
    const interceptor = new CatalogChangeInterceptor(catalogCache);
    const handler = createHandler(of('result'));

    const result = await firstValueFrom(
      interceptor.intercept(createContext('GET'), handler),
    );

    expect(result).toBe('result');
    expect(catalogCache.invalidate).not.toHaveBeenCalled();
  });

  it('does not invalidate the catalog cache when the handler throws', async () => {
    const catalogCache = createCatalogCache();
    const interceptor = new CatalogChangeInterceptor(catalogCache);
    const handler = createHandler(throwError(() => new Error('boom')));

    await expect(
      firstValueFrom(interceptor.intercept(createContext('POST'), handler)),
    ).rejects.toThrow('boom');
    expect(catalogCache.invalidate).not.toHaveBeenCalled();
  });
});
