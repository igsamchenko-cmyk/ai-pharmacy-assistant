import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogClientIndexAliases,
  conciseCatalogIndexForm,
  loadCatalogClientIndex,
  resetCatalogClientIndexCacheForTests,
  type CatalogClientIndexQueryExecutor,
} from "./catalogClientIndexService";

const SHA = "a".repeat(64);

function executor(
  options: {
    snapshotHash?: string;
    rowSnapshotHash?: string;
    productCount?: number;
  } = {},
): CatalogClientIndexQueryExecutor & { query: ReturnType<typeof vi.fn> } {
  const snapshotHash = options.snapshotHash ?? SHA;
  const productCount = options.productCount ?? 2;
  const rows = [
    {
      registry_id: "A".repeat(32),
      registration_number: "UA/1/01/01",
      trade_name: "ЕНАП®",
      inn: "Enalapril",
      form: "таблетки; по 10 таблеток у блістері",
      strength: "10 мг",
      source_snapshot_hash: options.rowSnapshotHash ?? snapshotHash,
    },
    {
      registry_id: "B".repeat(32),
      registration_number: "UA/2/01/01",
      trade_name: "ЕЛІКВІС",
      inn: "Apixaban",
      form: "таблетки in bulk; по 5000 таблеток",
      strength: "5 мг",
      source_snapshot_hash: options.rowSnapshotHash ?? snapshotHash,
    },
  ];
  const query = vi.fn(async (statement: string) => {
    if (statement.includes("COUNT(*)")) {
      return {
        rows: [
          {
            product_count: productCount,
            snapshot_count: 1,
            snapshot_hash: snapshotHash,
            generated_at: "2026-07-19T00:00:00.000Z",
          },
        ],
      };
    }
    return { rows };
  });
  return { query };
}

describe("catalog client index service", () => {
  beforeEach(() => resetCatalogClientIndexCacheForTests());

  it("builds a deterministic six-field projection with concise forms", async () => {
    const store = executor();
    const result = await loadCatalogClientIndex(null, store);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.payload).toMatchObject({
      version: 1,
      snapshotHash: SHA,
      productCount: 2,
    });
    expect(result.payload.aliasCount).toBe(result.payload.aliases.length);
    expect(result.payload.aliases).toContainEqual(["Еліквіс", "Апіксабан"]);
    expect(result.payload.rows[0]).toEqual([
      "A".repeat(32),
      "UA/1/01/01",
      "ЕНАП®",
      "Enalapril",
      "таблетки",
      "10 мг",
    ]);
    expect(result.payload.rows[1]?.[4]).toBe("таблетки");
    expect(result.wireBytes).toBeGreaterThan(0);
    expect(store.query).toHaveBeenCalledTimes(2);
  });

  it("returns not-modified after the metadata query without loading product rows", async () => {
    const store = executor();
    const result = await loadCatalogClientIndex(`W/\"${SHA}\"`, store);
    expect(result).toEqual({
      status: "not_modified",
      snapshotHash: SHA,
      productCount: 2,
    });
    expect(store.query).toHaveBeenCalledTimes(1);
  });

  it("fails closed if snapshot rows change, the count is unbounded or the hash is invalid", async () => {
    await expect(
      loadCatalogClientIndex(
        null,
        executor({ rowSnapshotHash: "b".repeat(64) }),
      ),
    ).rejects.toThrow(/changed/u);
    await expect(
      loadCatalogClientIndex(null, executor({ productCount: 20_001 })),
    ).rejects.toThrow(/complete versioned/u);
    await expect(
      loadCatalogClientIndex(null, executor({ snapshotHash: "not-a-sha" })),
    ).rejects.toThrow(/complete versioned/u);
  });

  it("exports only bounded, unambiguous source-backed aliases", () => {
    const aliases = buildCatalogClientIndexAliases();
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.length).toBeLessThanOrEqual(5_000);
    expect(aliases).toContainEqual(["Еліквіс", "Апіксабан"]);
    expect(
      new Set(aliases.map(([name]) => name.toLocaleLowerCase("uk-UA"))).size,
    ).toBe(aliases.length);
  });

  it("removes packaging and bulk text without truncating the medicine form", () => {
    expect(
      conciseCatalogIndexForm("розчин для ін'єкцій; по 2 мл в ампулі"),
    ).toBe("розчин для ін'єкцій");
    expect(
      conciseCatalogIndexForm("капсули тверді, по 10 капсул у блістері"),
    ).toBe("капсули тверді");
    expect(conciseCatalogIndexForm("порошок для розчину")).toBe(
      "порошок для розчину",
    );
  });
});
