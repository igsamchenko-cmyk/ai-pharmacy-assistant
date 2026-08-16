import { describe, expect, it } from "vitest";
import {
  logZeroResults,
  retainNewestZeroResultsLog,
  zeroResultsLogToJson,
  ZERO_RESULTS_LOG_LIMIT,
  type ZeroResultsLogRecord,
  type ZeroResultsLogStore,
} from "./zero-results-log";

class MemoryZeroResultsLogStore implements ZeroResultsLogStore {
  records = new Map<string, ZeroResultsLogRecord>();

  async append(record: ZeroResultsLogRecord) {
    this.records.set(record.id, record);
    const retained = retainNewestZeroResultsLog([...this.records.values()]);
    this.records = new Map(retained.map((item) => [item.id, item]));
  }

  async list(limit = ZERO_RESULTS_LOG_LIMIT) {
    return retainNewestZeroResultsLog([...this.records.values()], limit);
  }
}

function record(index: number): ZeroResultsLogRecord {
  return {
    id: `id-${index}`,
    ts: index,
    source: "catalog",
    query: `запит-${index}`,
  };
}

describe("zero results log", () => {
  it("retains only the newest 500 unique entries", () => {
    const retained = retainNewestZeroResultsLog(
      Array.from({ length: 505 }, (_, index) => record(index)),
    );
    expect(retained).toHaveLength(500);
    expect(retained[0]?.id).toBe("id-504");
    expect(retained.at(-1)?.id).toBe("id-5");
  });

  it("appends and lists newest-first", async () => {
    const store = new MemoryZeroResultsLogStore();
    await store.append(record(1));
    await store.append(record(2));
    const listed = await store.list();
    expect(listed.map((item) => item.id)).toEqual(["id-2", "id-1"]);
  });

  it("logZeroResults trims, caps and skips empty queries", async () => {
    const store = new MemoryZeroResultsLogStore();
    let now = 1_000;
    logZeroResults("catalog", "  нурофен дітям  ", store, () => now);
    now = 2_000;
    logZeroResults("instruction_search", "", store, () => now);
    now = 3_000;
    logZeroResults("instruction_search", "a".repeat(500), store, () => now);
    // append() is fire-and-forget inside logZeroResults; flush the
    // microtask queue before asserting.
    await Promise.resolve();
    await Promise.resolve();

    const listed = await store.list();
    expect(listed).toHaveLength(2);
    const catalogEntry = listed.find((item) => item.source === "catalog");
    expect(catalogEntry?.query).toBe("нурофен дітям");
    const longEntry = listed.find(
      (item) => item.source === "instruction_search",
    );
    expect(longEntry?.query).toHaveLength(200);
  });

  it("logZeroResults never throws when the store fails", () => {
    const failingStore: ZeroResultsLogStore = {
      async append() {
        throw new Error("blocked");
      },
      async list() {
        throw new Error("blocked");
      },
    };
    expect(() =>
      logZeroResults("catalog", "нурофен", failingStore, () => 1),
    ).not.toThrow();
  });

  it("serializes the log to a stable, self-describing JSON export", () => {
    const json = zeroResultsLogToJson([record(1), record(2)]);
    const parsed = JSON.parse(json) as {
      count: number;
      records: ZeroResultsLogRecord[];
      exportedAt: string;
    };
    expect(parsed.count).toBe(2);
    expect(parsed.records).toHaveLength(2);
    expect(() => new Date(parsed.exportedAt).toISOString()).not.toThrow();
  });
});
