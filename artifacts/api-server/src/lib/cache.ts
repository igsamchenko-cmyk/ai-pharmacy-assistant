/**
 * Tiny in-memory TTL cache used to avoid hammering external drug data APIs
 * (RxNorm, openFDA) with repeated lookups. Deliberately dependency-free and
 * process-local: it is a best-effort speed-up, not a source of truth.
 *
 * The clock is injectable so behaviour is deterministic in tests.
 */

export interface TtlCacheOptions {
  /** Default time-to-live in milliseconds for entries. */
  ttlMs: number;
  /** Max number of live entries kept; oldest are evicted first. */
  maxEntries?: number;
  /** Injectable clock (defaults to Date.now) for testability. */
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V, ttlMs?: number): void {
    // Evict the oldest entry when at capacity (Map preserves insertion order).
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: this.now() + (ttlMs ?? this.ttlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Return the cached value or compute, store, and return it. Concurrent calls
   * for the same key share the same in-flight promise so the loader runs once.
   * A rejected loader is never cached.
   */
  async getOrSet(
    key: string,
    loader: () => Promise<V>,
    ttlMs?: number,
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inflight = this.inflight.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const value = await loader();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  private readonly inflight = new Map<string, Promise<V>>();
}
