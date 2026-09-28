import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogCache } from './catalog-cache';
import { PublicCatalogController } from './public-catalog.controller';
import type { PublicCatalogService } from './public-catalog.service';

function createResponse(): { setHeader: ReturnType<typeof vi.fn> } {
  return { setHeader: vi.fn() };
}

describe('PublicCatalogController', () => {
  it('loads styles through the cache and sets Cache-Control on success', async () => {
    const catalog = {
      listStyles: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as PublicCatalogService;
    const cache = {
      getOrLoad: vi.fn((_key: string, load: () => Promise<unknown>) => load()),
    } as unknown as CatalogCache;
    const controller = new PublicCatalogController(catalog, cache);
    const response = createResponse();

    const result = await controller.listStyles(
      { lang: 'uk' },
      response as unknown as Response,
    );

    expect(cache.getOrLoad).toHaveBeenCalledWith(
      'styles:uk',
      expect.any(Function),
    );
    expect(catalog.listStyles).toHaveBeenCalledWith('uk');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30',
    );
    expect(result).toEqual({ items: [] });
  });

  it('does not set Cache-Control when the cache load rejects', async () => {
    const catalog = {
      listStyles: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as PublicCatalogService;
    const cache = {
      getOrLoad: vi.fn((_key: string, load: () => Promise<unknown>) => load()),
    } as unknown as CatalogCache;
    const controller = new PublicCatalogController(catalog, cache);
    const response = createResponse();

    await expect(
      controller.listStyles({ lang: 'uk' }, response as unknown as Response),
    ).rejects.toThrow('boom');
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
