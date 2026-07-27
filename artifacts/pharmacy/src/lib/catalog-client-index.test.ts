import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_CLIENT_INDEX_VERSION,
  compileCatalogClientIndex,
  encodeCatalogClientIndexRow,
  normalizeCatalogIndexText,
  searchCatalogClientIndex,
  type CatalogClientIndexAliasRow,
  type CatalogClientIndexPayload,
  type CatalogClientIndexProduct,
  type CompiledCatalogClientIndex,
} from "@workspace/catalog-index";
import {
  LocalCatalogResults,
  groupLocalCatalogResults,
  registeredVariantsLabel,
} from "@/components/local-catalog-results";
import {
  CATALOG_CLIENT_INDEX_REFRESH_DELAY_MS,
  compileCatalogClientIndexCooperatively,
  compileCatalogClientIndexOffMainThread,
  deferCatalogClientIndexFetcher,
  refreshCatalogClientIndex,
  type CatalogClientIndexFetcher,
  type CatalogClientIndexWorkerLike,
} from "@/lib/catalog-client-index";
import {
  validatePersistedCatalogClientIndex,
  type CatalogClientIndexStorage,
} from "@/lib/catalog-client-index-storage";
import { shouldUseServerCatalogSearch } from "@/pages/search";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function id(value: number): string {
  return value.toString(16).toUpperCase().padStart(32, "0");
}

function product(
  value: number,
  tradeName: string,
  inn: string,
  strength = "10 мг",
): CatalogClientIndexProduct {
  return {
    productId: id(value),
    registration: `UA/${value}/01/01`,
    tradeName,
    inn,
    form: "таблетки",
    strength,
  };
}

function payload(
  products: CatalogClientIndexProduct[],
  snapshotHash = HASH_A,
  aliases: CatalogClientIndexAliasRow[] = [],
): CatalogClientIndexPayload {
  return {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash,
    generatedAt: "2026-07-19T00:00:00.000Z",
    productCount: products.length,
    aliasCount: aliases.length,
    rows: products.map(encodeCatalogClientIndexRow),
    aliases,
  };
}

const representativeProducts = [
  product(1, "ЕНАП®", "Enalapril", "5 мг"),
  product(2, "ЕНАП®", "Enalapril", "10 мг"),
  product(3, "ЕНАЛАПРИЛ", "Enalapril", "10 мг"),
  product(4, "ЕНАЛАПРИЛ КРКА", "Enalapril", "20 мг"),
  product(5, "ЕЛІКВІС®", "Apixaban", "5 мг"),
  product(6, "КСАРЕЛТО®", "Rivaroxaban", "20 мг"),
];

class MemoryStorage implements CatalogClientIndexStorage {
  active: CompiledCatalogClientIndex | null;
  writes: string[] = [];

  constructor(active: CompiledCatalogClientIndex | null = null) {
    this.active = active;
  }

  async readActive(): Promise<CompiledCatalogClientIndex | null> {
    return this.active;
  }

  async writeAndActivate(next: CompiledCatalogClientIndex): Promise<void> {
    this.writes.push(next.snapshotHash);
    this.active = next;
  }
}
describe("catalog client index", () => {
  it("keeps exact trade names above INN and groups same-brand variants", () => {
    const index = compileCatalogClientIndex(payload(representativeProducts));
    const exactBrand = searchCatalogClientIndex(index, "Енап");
    expect(
      exactBrand.items.slice(0, 2).map((item) => item.product.tradeName),
    ).toEqual(["ЕНАП®", "ЕНАП®"]);
    expect(exactBrand.items[0]?.matchedBy).toBe("trade_exact");

    const inn = searchCatalogClientIndex(index, "Еналаприл");
    expect(inn.items[0]?.product.tradeName).toBe("ЕНАЛАПРИЛ");
    expect(inn.items[0]?.matchedBy).toBe("trade_exact");
    expect(inn.items.some((item) => item.product.tradeName === "ЕНАП®")).toBe(
      true,
    );

    const groups = groupLocalCatalogResults(exactBrand.items);
    expect(groups[0]?.tradeName).toBe("ЕНАП®");
    expect(groups[0]?.variants).toHaveLength(2);
  });

  it("explains same-brand registry variants consistently across the catalog", () => {
    expect(registeredVariantsLabel(1)).toBe(
      "1 торгова назва · 1 зареєстрований варіант",
    );
    expect(registeredVariantsLabel(2)).toBe(
      "1 торгова назва · 2 зареєстровані варіанти",
    );
    expect(registeredVariantsLabel(5)).toBe(
      "1 торгова назва · 5 зареєстрованих варіантів",
    );
    expect(registeredVariantsLabel(21)).toBe(
      "1 торгова назва · 21 зареєстрований варіант",
    );

    const result = searchCatalogClientIndex(
      compileCatalogClientIndex(payload(representativeProducts)),
      "Енап",
    );
    const html = renderToStaticMarkup(
      createElement(
        Router,
        { hook: () => ["/search", () => undefined] },
        createElement(LocalCatalogResults, { result }),
      ),
    );
    expect(html).toContain("1 торгова назва · 2 зареєстровані варіанти");
    expect(html).toContain("Реєстровий варіант 1");
    expect(html).toContain("Реєстровий варіант 2");
    expect(html).toContain("Реєстрація:");
  });

  it("supports deterministic punctuation, prefix, registration and transliteration search", () => {
    const index = compileCatalogClientIndex(payload(representativeProducts));
    expect(normalizeCatalogIndexText("ЕЛІКВІС®")).toBe(
      normalizeCatalogIndexText("еліквіс"),
    );
    expect(
      searchCatalogClientIndex(index, "elik").items[0]?.product.tradeName,
    ).toBe("ЕЛІКВІС®");
    expect(
      searchCatalogClientIndex(index, "enap").items[0]?.product.tradeName,
    ).toBe("ЕНАП®");
    expect(
      searchCatalogClientIndex(index, "UA/5/01/01").items[0]?.product.tradeName,
    ).toBe("ЕЛІКВІС®");
  });

  it("matches the controlled Ukrainian e/ye search-token equivalence", () => {
    const nurofen = "\u041d\u0423\u0420\u041e\u0424\u0404\u041d\u00ae";
    const amoxiclav =
      "\u0410\u041c\u041e\u041a\u0421\u0418\u041a\u041b\u0410\u0412\u00ae";
    const unrelated = "\u041d\u0415\u0423\u0420\u041e\u0411\u0415\u041a\u0421";
    const index = compileCatalogClientIndex(
      payload([
        ...representativeProducts,
        product(7, nurofen, "Ibuprofen", "200 \u043c\u0433"),
        product(
          8,
          amoxiclav,
          "Amoxicillin + clavulanic acid",
          "625 \u043c\u0433",
        ),
        product(9, unrelated, "Vitamins", "10 \u043c\u0433"),
      ]),
    );

    for (const query of [
      "\u041d\u0443\u0440\u043e\u0444\u0435\u043d",
      "\u041d\u0423\u0420\u041e\u0424\u0404\u041d",
    ]) {
      const result = searchCatalogClientIndex(index, query);
      expect(result.items[0]?.product.tradeName).toBe(nurofen);
      expect(result.items[0]?.matchedBy).toBe("trade_exact");
      expect(
        result.items.some((item) => item.product.tradeName === unrelated),
      ).toBe(false);
    }

    const regressions = [
      ["\u0415\u043d\u0430\u043f", "\u0415\u041d\u0410\u041f\u00ae"],
      [
        "\u0415\u043b\u0456\u043a\u0432\u0456\u0441",
        "\u0415\u041b\u0406\u041a\u0412\u0406\u0421\u00ae",
      ],
      [
        "\u0410\u043c\u043e\u043a\u0441\u0438\u043a\u043b\u0430\u0432",
        amoxiclav,
      ],
      [
        "\u041a\u0441\u0430\u0440\u0435\u043b\u0442\u043e",
        "\u041a\u0421\u0410\u0420\u0415\u041b\u0422\u041e\u00ae",
      ],
    ] as const;
    for (const [query, expected] of regressions) {
      expect(
        searchCatalogClientIndex(index, query).items[0]?.product.tradeName,
      ).toBe(expected);
    }
  });

  it("resolves source-backed brand aliases locally without outranking direct trade matches", () => {
    const products = [
      ...representativeProducts.filter((item) => item.tradeName !== "ЕЛІКВІС®"),
      product(7, "АПІКСАБАН", "Apixaban", "5 мг"),
      product(8, "АПІГРА", "Apixaban", "5 мг"),
    ];
    const index = compileCatalogClientIndex(
      payload(products, HASH_A, [["Еліквіс", "Апіксабан"]]),
    );
    const result = searchCatalogClientIndex(index, "Еліквіс");
    expect(result.items[0]?.product.tradeName).toBe("АПІКСАБАН");
    expect(result.items[0]?.matchedBy).toBe("source_alias");
    expect(
      result.items.some((item) => item.product.tradeName === "АПІГРА"),
    ).toBe(true);
    expect(searchCatalogClientIndex(index, "Енап").items[0]?.matchedBy).toBe(
      "trade_exact",
    );
  });

  it("rejects incomplete, duplicate and wrongly versioned payloads", () => {
    const valid = payload(representativeProducts);
    expect(() =>
      compileCatalogClientIndex({ ...valid, productCount: 99 }),
    ).toThrow(/count/u);
    expect(() =>
      compileCatalogClientIndex({ ...valid, version: 2 as 1 }),
    ).toThrow(/version/u);
    expect(() =>
      compileCatalogClientIndex({
        ...valid,
        rows: [valid.rows[0]!, valid.rows[0]!],
        productCount: 2,
      }),
    ).toThrow(/duplicates/u);
  });

  it("keeps a cached snapshot searchable offline and activates a changed hash only after validation", async () => {
    const oldPayload = payload(representativeProducts, HASH_A);
    const nextPayload = payload(representativeProducts, HASH_B);
    const storage = new MemoryStorage(compileCatalogClientIndex(oldPayload));
    const seen: string[] = [];
    const refreshed = await refreshCatalogClientIndex(
      storage,
      async () => nextPayload,
      (cached) => seen.push(cached.snapshotHash),
    );
    expect(seen).toEqual([HASH_A]);
    expect(storage.writes).toEqual([HASH_B]);
    expect(refreshed.index.snapshotHash).toBe(HASH_B);

    const offlineFetcher: CatalogClientIndexFetcher = async () => {
      throw new Error("offline");
    };
    const offline = await refreshCatalogClientIndex(storage, offlineFetcher);
    expect(offline.source).toBe("cache");
    expect(offline.stale).toBe(true);
    expect(
      searchCatalogClientIndex(offline.index, "Еліквіс").total,
    ).toBeGreaterThan(0);
  });

  it("reuses a persisted prepared index without recompiling it", async () => {
    const cached = compileCatalogClientIndex(
      payload(representativeProducts, HASH_A),
    );
    const storage = new MemoryStorage(cached);
    const compiler = vi.fn(async () => {
      throw new Error("warm cache must not compile");
    });
    const refreshed = await refreshCatalogClientIndex(
      storage,
      async (snapshotHash) => {
        expect(snapshotHash).toBe(HASH_A);
        return null;
      },
      undefined,
      undefined,
      compiler,
    );
    expect(compiler).not.toHaveBeenCalled();
    expect(refreshed.index).toBe(cached);
  });

  it("accepts only bounded, versioned prepared indexes from persistence", () => {
    const index = compileCatalogClientIndex(
      payload(representativeProducts, HASH_A),
    );
    const record = {
      storageVersion: 1,
      snapshotHash: HASH_A,
      index,
    };
    expect(validatePersistedCatalogClientIndex(record)).toBe(index);
    expect(
      validatePersistedCatalogClientIndex({
        ...record,
        snapshotHash: HASH_B,
      }),
    ).toBeNull();
    expect(
      validatePersistedCatalogClientIndex({
        ...record,
        index: {
          ...index,
          estimatedMemoryBytes: index.estimatedMemoryBytes + 2,
        },
      }),
    ).toBeNull();
    expect(
      validatePersistedCatalogClientIndex(
        payload(representativeProducts, HASH_A),
      ),
    ).toBeNull();
  });

  it("compiles a cold payload in a worker and terminates it", async () => {
    const source = payload(representativeProducts, HASH_A);
    const expected = compileCatalogClientIndex(source);
    const worker: CatalogClientIndexWorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(() => {
        queueMicrotask(() =>
          worker.onmessage?.({
            data: { status: "ready", index: expected },
          } as MessageEvent),
        );
      }),
      terminate: vi.fn(),
    };
    const compiled = await compileCatalogClientIndexOffMainThread(
      source,
      undefined,
      () => worker,
    );
    expect(compiled).toBe(expected);
    expect(worker.postMessage).toHaveBeenCalledWith(source);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("uses a server request only while the local index loads or is unavailable", () => {
    expect(shouldUseServerCatalogSearch("loading", false, "Енап")).toBe(false);
    expect(shouldUseServerCatalogSearch("ready", false, "Енап")).toBe(false);
    expect(shouldUseServerCatalogSearch("error", false, "Енап")).toBe(true);
    expect(shouldUseServerCatalogSearch("ready", true, "Енап")).toBe(true);
    expect(shouldUseServerCatalogSearch("loading", false, "")).toBe(false);
    expect(shouldUseServerCatalogSearch("error", false, "")).toBe(true);
  });

  it("compiles a full payload cooperatively without changing search results", async () => {
    const products = Array.from({ length: 300 }, (_, index) =>
      product(
        index + 1,
        "MEDICINE " + (index + 1),
        "Ingredient " + (index + 1),
      ),
    );
    const yieldControl = vi.fn().mockResolvedValue(undefined);
    const compiled = await compileCatalogClientIndexCooperatively(
      payload(products),
      { chunkSize: 64, yieldControl },
    );
    expect(compiled.productCount).toBe(300);
    expect(yieldControl).toHaveBeenCalledTimes(4);
    expect(searchCatalogClientIndex(compiled, "MEDICINE 250").total).toBe(1);
  });

  it("starts the initial index immediately and defers only cached refresh", async () => {
    vi.useFakeTimers();
    try {
      const upstream = vi
        .fn<CatalogClientIndexFetcher>()
        .mockResolvedValue(null);
      const deferred = deferCatalogClientIndexFetcher(upstream);

      const initial = deferred(null);
      expect(upstream).toHaveBeenCalledOnce();
      await expect(initial).resolves.toBeNull();

      upstream.mockClear();
      const refresh = deferred(HASH_A);
      await vi.advanceTimersByTimeAsync(
        CATALOG_CLIENT_INDEX_REFRESH_DELAY_MS - 1,
      );
      expect(upstream).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(refresh).resolves.toBeNull();
      expect(upstream).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders exact product routes without horizontal overflow", () => {
    const result = searchCatalogClientIndex(
      compileCatalogClientIndex(payload(representativeProducts)),
      "Енап",
    );
    const html = renderToStaticMarkup(
      createElement(
        Router,
        { hook: () => ["/search", () => undefined] },
        createElement(LocalCatalogResults, { result }),
      ),
    );
    expect(html).toContain(`/products/${id(1)}?registration=UA%2F1%2F01%2F01`);
    expect(html).toContain('data-navigation="spa"');
    expect(html).toContain('data-testid="local-product-open-');
    expect(html).toContain("overflow-x-hidden");
    expect(html).not.toContain("overflow-x-auto");
  });

  it("keeps a 16,533-row index searchable within the local latency budget", () => {
    const products = Array.from({ length: 16_533 }, (_, index) =>
      product(
        index + 1,
        `ПРЕПАРАТ ${String(index + 1).padStart(5, "0")}`,
        `Ingredient ${index + 1}`,
      ),
    );
    const compileStartedAt = performance.now();
    const compiled = compileCatalogClientIndex(payload(products));
    expect(performance.now() - compileStartedAt).toBeLessThanOrEqual(5_000);
    expect(compiled.productCount).toBe(16_533);
    expect(
      compiled.products.every((item) =>
        Boolean(item.productId && item.registration),
      ),
    ).toBe(true);
    const durations: number[] = [];
    for (let run = 0; run < 30; run += 1) {
      const query =
        run % 2 === 0
          ? `UA/${10_000 + run}/01/01`
          : `ПРЕПАРАТ ${String(10_000 + run).padStart(5, "0")}`;
      durations.push(searchCatalogClientIndex(compiled, query).durationMs);
    }
    durations.sort((left, right) => left - right);
    const p95 =
      durations[Math.ceil(durations.length * 0.95) - 1] ??
      Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThanOrEqual(50);
  });
});
