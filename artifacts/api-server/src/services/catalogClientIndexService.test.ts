import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogClientIndexAliases,
  conciseCatalogIndexForm,
  loadCatalogClientIndex,
  resetCatalogClientIndexCacheForTests,
  warmCatalogClientIndexCache,
  type CatalogClientIndexQueryExecutor,
} from "./catalogClientIndexService";

const SHA = "a".repeat(64);

function executor(
  options: {
    snapshotHash?: string;
    rowSnapshotHash?: string;
    productCount?: number;
    tradeName?: string;
    form?: string;
    manufacturer?: string;
    rows?: { registration_number: string; inn: string; strength?: string }[];
  } = {},
): CatalogClientIndexQueryExecutor & { query: ReturnType<typeof vi.fn> } {
  const snapshotHash = options.snapshotHash ?? SHA;
  const productCount = options.productCount ?? 2;
  const rows = options.rows
    ? options.rows.map((row, index) => ({
        registry_id: String.fromCharCode(65 + index).repeat(32),
        registration_number: row.registration_number,
        trade_name: `ПРЕПАРАТ ${index + 1}`,
        inn: row.inn,
        form: "таблетки",
        strength: row.strength ?? "10 мг",
        manufacturer: "Виробник",
        registration_end_date: "2030-01-01",
        early_termination: "",
        source_snapshot_hash: options.rowSnapshotHash ?? snapshotHash,
      }))
    : [
        {
          registry_id: "A".repeat(32),
          registration_number: "UA/1/01/01",
          trade_name: options.tradeName ?? "ЕНАП®",
          inn: "Enalapril",
          form: options.form ?? "таблетки; по 10 таблеток у блістері",
          strength: "10 мг",
          manufacturer: options.manufacturer ?? "КРКА",
          registration_end_date: "2030-01-01",
          early_termination: "",
          source_snapshot_hash: options.rowSnapshotHash ?? snapshotHash,
        },
        {
          registry_id: "B".repeat(32),
          registration_number: "UA/2/01/01",
          trade_name: "ЕЛІКВІС",
          inn: "Apixaban",
          form: "таблетки in bulk; по 5000 таблеток",
          strength: "5 мг",
          manufacturer: "Пфайзер",
          registration_end_date: "01.01.2020",
          early_termination: "",
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

  it("builds a deterministic nine-field projection with concise forms", async () => {
    const store = executor();
    const result = await loadCatalogClientIndex(null, store);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.payload).toMatchObject({
      version: 3,
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
      "",
      "КРКА",
      "2030-01-01",
    ]);
    expect(result.payload.rows[1]?.[4]).toBe("таблетки");
    // A dotted end date is normalised, so the client can compare it as a date.
    expect(result.payload.rows[1]?.[8]).toBe("2020-01-01");
    expect(result.wireBytes).toBeGreaterThan(0);
    expect(store.query).toHaveBeenCalledTimes(2);
  });

  it("resolves a composition key only where the registry МНН is a placeholder", async () => {
    // UA/6025/01/01 is РЕННІ® БЕЗ ЦУКРУ, whose registry МНН is the literal
    // placeholder "Comb drug"; the МОЗ price catalog records its real
    // composition as "Кальцію карбонат + МАГНІЮ КАРБОНАТ ВАЖКИЙ".
    const store = executor({
      rows: [
        { registration_number: "UA/6025/01/01", inn: "Comb drug" },
        { registration_number: "UA/6025/01/01", inn: "Enalapril" },
      ],
    });
    const result = await loadCatalogClientIndex(null, store);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const placeholderRow = result.payload.rows[0];
    expect(placeholderRow?.[6]).toBe("кальціюкарбонат;магніюкарбонатважкии");

    // The same registration with a usable МНН keeps an empty composition key:
    // a real substance name is never overridden by the price catalog.
    expect(result.payload.rows[1]?.[6]).toBe("");
  });

  it("drops an over-long declared strength instead of taking the catalog offline", async () => {
    // Regression: the МОЗ price catalog records some combination strengths as
    // multi-hundred-character prose. Feeding one into the 120-character
    // strength bound threw, and because the whole payload is built in one
    // pass, a single unusable value returned 503 for the entire catalog.
    // UA/6658/01/01 is real: its declared strength is 861 characters.
    const store = executor({
      productCount: 1,
      // An empty registry strength is what sends the row to the price-catalog
      // backfill in the first place.
      rows: [
        {
          registration_number: "UA/6658/01/01",
          inn: "Comb drug",
          strength: "",
        },
      ],
    });
    const result = await loadCatalogClientIndex(null, store);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.payload.rows).toHaveLength(1);
    expect(result.payload.rows[0]?.[5]).toBe("");
  });

  it("truncates an over-long manufacturer instead of taking the catalog offline", async () => {
    // Regression: the second outage from the same shape of defect. The registry
    // spells production roles out inside the manufacturer name — UA/17978/01/01
    // runs to 607 characters — and the 500-character bound threw on it, so one
    // unreadable cell answered 503 for all 16601 positions. Manufacturer is the
    // field the analog list uses to tell two same-name registrations apart, so
    // it is cut rather than dropped, and the cut is visible.
    const manufacturer = `Біоген (Данія) Менюфекчуринг АпС ${"роль ".repeat(120)}`;
    expect(manufacturer.trim()).toHaveLength(632);

    const result = await loadCatalogClientIndex(
      null,
      executor({ manufacturer }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const stored = result.payload.rows[0]?.[7] ?? "";
    expect(stored.length).toBeLessThanOrEqual(500);
    expect(stored.startsWith("Біоген (Данія) Менюфекчуринг АпС")).toBe(true);
    // Without the ellipsis a cut name reads as the whole registered name.
    expect(stored.endsWith("\u2026")).toBe(true);
  });

  it("prewarms once and shares one payload build across concurrent clients", async () => {
    const warmStore = executor();
    await expect(warmCatalogClientIndexCache(warmStore)).resolves.toMatchObject(
      {
        snapshotHash: SHA,
        productCount: 2,
      },
    );
    await loadCatalogClientIndex(null, warmStore);
    expect(warmStore.query).toHaveBeenCalledTimes(3);

    resetCatalogClientIndexCacheForTests();
    const concurrentStore = executor();
    const [first, second] = await Promise.all([
      loadCatalogClientIndex(null, concurrentStore),
      loadCatalogClientIndex(null, concurrentStore),
    ]);
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(concurrentStore.query).toHaveBeenCalledTimes(3);
    if (first.status === "ready" && second.status === "ready") {
      expect(first.payload).toBe(second.payload);
    }
  });

  it("accepts current official trade names and concise forms within the API bound", async () => {
    const tradeName = "T".repeat(253);
    const form = "F".repeat(326);
    const result = await loadCatalogClientIndex(
      null,
      executor({ tradeName, form }),
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.payload.rows[0]?.[2]).toHaveLength(253);
    expect(result.payload.rows[0]?.[4]).toHaveLength(326);
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
