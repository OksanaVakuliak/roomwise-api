import { Injectable } from '@nestjs/common';
import { Clock } from '../../auth/clock';

const CATALOG_CACHE_TTL_SECONDS = 30;
const MS_PER_SECOND = 1000;

export const CATALOG_CACHE_TTL_MS = CATALOG_CACHE_TTL_SECONDS * MS_PER_SECOND;
export const CATALOG_CACHE_CONTROL_HEADER = `public, max-age=${CATALOG_CACHE_TTL_SECONDS}`;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CatalogCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private generation = 0;

  constructor(private readonly clock: Clock) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.clock.now().getTime();
    const entry = this.entries.get(key);

    if (entry && entry.expiresAt > now) {
      return entry.value as T;
    }

    const pending = this.pending.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const generation = this.generation;
    const loadPromise = load()
      .then((value) => {
        if (generation === this.generation) {
          this.entries.set(key, {
            value,
            expiresAt: this.clock.now().getTime() + CATALOG_CACHE_TTL_MS,
          });
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === loadPromise) {
          this.pending.delete(key);
        }
      });

    this.pending.set(key, loadPromise);

    return loadPromise;
  }

  invalidate(): void {
    this.generation += 1;
    this.entries.clear();
    this.pending.clear();
  }
}
