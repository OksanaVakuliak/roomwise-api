import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../common/clock/clock';
import { CATALOG_CACHE_TTL_MS, CatalogCache } from './catalog-cache';

interface FakeClock extends Clock {
  advance: (ms: number) => void;
}

function createClock(initial: number): FakeClock {
  let current = initial;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('CatalogCache', () => {
  it('returns the cached value within the TTL without reloading', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    const load = vi.fn().mockResolvedValue('value');

    const first = await cache.getOrLoad('key', load);
    clock.advance(CATALOG_CACHE_TTL_MS - 1);
    const second = await cache.getOrLoad('key', load);

    expect(first).toBe('value');
    expect(second).toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads once the TTL has expired', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    const load = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await cache.getOrLoad('key', load);
    clock.advance(CATALOG_CACHE_TTL_MS);
    const result = await cache.getOrLoad('key', load);

    expect(result).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('caches each key independently', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    const loadA = vi.fn().mockResolvedValue('a');
    const loadB = vi.fn().mockResolvedValue('b');

    const a = await cache.getOrLoad('a', loadA);
    const b = await cache.getOrLoad('b', loadB);
    const aAgain = await cache.getOrLoad('a', loadA);

    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(aAgain).toBe('a');
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
  });

  it('clears every entry on invalidate', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    const load = vi.fn().mockResolvedValue('value');

    await cache.getOrLoad('key', load);
    cache.invalidate();
    await cache.getOrLoad('key', load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected load', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('value');

    await expect(cache.getOrLoad('key', load)).rejects.toThrow('boom');
    const result = await cache.getOrLoad('key', load);

    expect(result).toBe('value');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent misses', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    let resolveLoad: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = cache.getOrLoad('key', load);
    const second = cache.getOrLoad('key', load);
    resolveLoad('value');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe('value');
    expect(secondResult).toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a load that was in flight during invalidate', async () => {
    const clock = createClock(0);
    const cache = new CatalogCache(clock);
    let resolveStale: (value: string) => void = () => {};
    const staleLoad = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveStale = resolve;
        }),
    );
    const freshLoad = vi.fn().mockResolvedValue('fresh');

    const stale = cache.getOrLoad('key', staleLoad);
    cache.invalidate();
    resolveStale('stale');
    await stale;

    await expect(cache.getOrLoad('key', freshLoad)).resolves.toBe('fresh');
    expect(freshLoad).toHaveBeenCalledTimes(1);
  });
});
