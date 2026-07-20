import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CLIENT_INDEX_VERSION,
  compileCatalogClientIndex,
  encodeCatalogClientIndexRow,
  normalizeCatalogIndexText,
  searchCatalogClientIndex,
  type CatalogClientIndexAliasRow,
  type CatalogClientIndexPayload,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";
import {
  LocalCatalogResults,
  groupLocalCatalogResults,
} from "@/components/local-catalog-results";
import {
  refreshCatalogClientIndex,
  type CatalogClientIndexFetcher,
} from "@/lib/catalog-client-index";
import type { CatalogClientIndexStorage } from "@/lib/catalog-client-index-storage";
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
  active: CatalogClientIndexPayload | null;
  writes: string[] = [];

  constructor(active: CatalogClientIndexPayload | null = null) {
    this.active = active;
  }

  async readActive(): Promise<CatalogClientIndexPayload | null> {
    return this.active;
  }

  async writeAndActivate(next: CatalogClientIndexPayload): Promise<void> {
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
    const storage = new MemoryStorage(oldPayload);
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

  it("does not enable a server request for typing while the local index loads or is ready", () => {
    expect(shouldUseServerCatalogSearch("loading", false, "Енап")).toBe(false);
    expect(shouldUseServerCatalogSearch("ready", false, "Енап")).toBe(false);
    expect(shouldUseServerCatalogSearch("error", false, "Енап")).toBe(true);
    expect(shouldUseServerCatalogSearch("ready", true, "Енап")).toBe(true);
  });

  it("renders exact product routes without horizontal overflow", () => {
    const result = searchCatalogClientIndex(
      compileCatalogClientIndex(payload(representativeProducts)),
      "Енап",
    );
    const html = renderToStaticMarkup(
      createElement(LocalCatalogResults, { result }),
    );
    expect(html).toContain(`/products/${id(1)}?registration=UA%2F1%2F01%2F01`);
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
    const compiled = compileCatalogClientIndex(payload(products));
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
