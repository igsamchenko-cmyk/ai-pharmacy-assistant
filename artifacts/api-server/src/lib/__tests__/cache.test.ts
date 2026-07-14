import { describe, it, expect, vi } from "vitest";
import { TtlCache } from "../cache";

function clock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TtlCache", () => {
  it("stores and returns values before expiry", () => {
    const c = new TtlCache<number>({ ttlMs: 1000 });
    c.set("a", 42);
    expect(c.get("a")).toBe(42);
    expect(c.has("a")).toBe(true);
    expect(c.size).toBe(1);
  });

  it("expires entries after the TTL", () => {
    const t = clock();
    const c = new TtlCache<string>({ ttlMs: 1000, now: t.now });
    c.set("k", "v");
    t.advance(999);
    expect(c.get("k")).toBe("v");
    t.advance(2);
    expect(c.get("k")).toBeUndefined();
    expect(c.has("k")).toBe(false);
  });

  it("getOrSet computes once and caches the result", async () => {
    const c = new TtlCache<number>({ ttlMs: 1000 });
    const loader = vi.fn().mockResolvedValue(7);
    expect(await c.getOrSet("x", loader)).toBe(7);
    expect(await c.getOrSet("x", loader)).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("getOrSet dedupes concurrent loads for the same key", async () => {
    const c = new TtlCache<number>({ ttlMs: 1000 });
    let resolve!: (n: number) => void;
    const loader = vi.fn(
      () => new Promise<number>((r) => (resolve = r)),
    );
    const p1 = c.getOrSet("k", loader);
    const p2 = c.getOrSet("k", loader);
    resolve(5);
    expect(await Promise.all([p1, p2])).toEqual([5, 5]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("uses a shorter computed TTL for negative results", async () => {
    const t = clock();
    const c = new TtlCache<string | null>({ ttlMs: 1000, now: t.now });
    const loader = vi.fn().mockResolvedValue(null);
    const ttl = (value: string | null) => value === null ? 100 : 1000;

    expect(await c.getOrSet("missing", loader, ttl)).toBeNull();
    expect(await c.getOrSet("missing", loader, ttl)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    t.advance(101);
    expect(await c.getOrSet("missing", loader, ttl)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected loader", async () => {
    const c = new TtlCache<number>({ ttlMs: 1000 });
    await expect(
      c.getOrSet("k", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(c.has("k")).toBe(false);
    // A subsequent successful load works and is cached.
    expect(await c.getOrSet("k", () => Promise.resolve(9))).toBe(9);
  });

  it("evicts the least recently used entry past maxEntries", () => {
    const c = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 });
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("c")).toBe(3);
  });
});
