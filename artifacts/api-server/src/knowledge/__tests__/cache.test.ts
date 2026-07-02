import { describe, it, expect, vi, afterEach } from "vitest";
import { TtlCache } from "../search/cache";

afterEach(() => {
  vi.useRealTimers();
});

describe("TtlCache", () => {
  it("stores and retrieves values", () => {
    const cache = new TtlCache<number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.has("a")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("returns undefined for missing keys", () => {
    const cache = new TtlCache<number>();
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string>(1000);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    vi.advanceTimersByTime(1001);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("clears all entries", () => {
    const cache = new TtlCache<number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
