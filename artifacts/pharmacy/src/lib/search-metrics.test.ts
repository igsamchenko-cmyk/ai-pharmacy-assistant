import { describe, expect, it } from "vitest";
import {
  createSearchMetricsTracker,
  retainNewestSearchMetrics,
  type SearchMetricRecord,
  type SearchMetricsStore,
} from "./search-metrics";

class FakePerformance {
  time = 0;
  marks = new Map<string, number>();
  measures = new Map<string, Array<{ duration: number }>>();

  mark(name: string) {
    this.marks.set(name, this.time);
  }

  measure(name: string, startMark: string, endMark: string) {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    if (start === undefined || end === undefined)
      throw new Error("missing mark");
    this.measures.set(name, [{ duration: end - start }]);
  }

  getEntriesByName(name: string) {
    return this.measures.get(name) ?? [];
  }
}

class MemoryMetricStore implements SearchMetricsStore {
  records = new Map<string, SearchMetricRecord>();

  async upsert(record: SearchMetricRecord) {
    this.records.set(record.id, record);
  }

  async list(limit = 200) {
    return retainNewestSearchMetrics([...this.records.values()], limit);
  }
}

function record(index: number): SearchMetricRecord {
  return {
    id: String(index),
    ts: index,
    cold: false,
    ttir: index,
    ttfr: null,
    ttc: null,
    ttSec: null,
    catalogSize: 16_533,
    indexBuildMs: 0,
    serializedIndexBytes: 1_000,
    uaMobile: false,
  };
}

describe("search metrics", () => {
  it("measures TTIR, TTFR and TTC from app start once", async () => {
    const performance = new FakePerformance();
    const store = new MemoryMetricStore();
    const tracker = createSearchMetricsTracker({
      performance,
      store,
      now: () => 1_700_000_000_000,
      sessionId: "session-a",
      userAgent: "Android",
    });

    tracker.markAppStart();
    performance.time = 40;
    tracker.markIndexReady({
      catalogSize: 16_533,
      indexBuildMs: 18,
      serializedIndexBytes: 2_000_000,
      cold: true,
    });
    performance.time = 75;
    tracker.markFirstResult("Нурофен");
    tracker.markFirstResult("Енап");
    performance.time = 120;
    tracker.markCardOpen("A".repeat(32));
    performance.time = 150;
    tracker.markSectionOpen("indications");
    performance.time = 200;
    tracker.markSectionOpen("interactions");
    await tracker.flush();

    expect(tracker.snapshot()).toEqual({
      id: "session-a",
      ts: 1_700_000_000_000,
      cold: true,
      ttir: 40,
      ttfr: 75,
      ttc: 120,
      ttSec: 150,
      catalogSize: 16_533,
      indexBuildMs: 18,
      serializedIndexBytes: 2_000_000,
      uaMobile: true,
    });
    expect((await store.list())[0]).toEqual(tracker.snapshot());
  });

  it("retains only the newest 200 unique sessions", () => {
    const retained = retainNewestSearchMetrics(
      Array.from({ length: 205 }, (_, index) => record(index)),
    );
    expect(retained).toHaveLength(200);
    expect(retained[0]?.id).toBe("204");
    expect(retained.at(-1)?.id).toBe("5");
  });

  it("is a no-op without the Performance API", async () => {
    const store = new MemoryMetricStore();
    const tracker = createSearchMetricsTracker({
      performance: undefined,
      store,
      sessionId: "no-performance",
    });

    expect(() => {
      tracker.markAppStart();
      tracker.markIndexReady({
        catalogSize: 1,
        indexBuildMs: 1,
        serializedIndexBytes: 1,
        cold: true,
      });
      tracker.markFirstResult("Енап");
      tracker.markCardOpen("A".repeat(32));
      tracker.markSectionOpen("indications");
    }).not.toThrow();
    await tracker.flush();
    expect(tracker.snapshot()).toBeNull();
    expect(await store.list()).toEqual([]);
  });
});
