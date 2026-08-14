import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_CLIENT_INDEX_VERSION,
  compileCatalogClientIndex,
  encodeCatalogClientIndexRow,
  normalizeAndSearchCatalogClientIndex,
  normalizeCatalogSearchTokenText,
  searchCatalogClientIndex,
  type CatalogClientIndexPayload,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";
import { LocalCatalogResults } from "@/components/local-catalog-results";
import {
  createCatalogClientIndexNormalizedSearcher,
  type CatalogClientIndexSearchWorkerLike,
} from "@/lib/catalog-client-index";

const HASH = "c".repeat(64);

function id(value: number): string {
  return value.toString(16).toUpperCase().padStart(32, "0");
}

function product(
  value: number,
  tradeName: string,
  inn = "Test substance",
): CatalogClientIndexProduct {
  return {
    productId: id(value),
    registration: `UA/${value}/01/01`,
    tradeName,
    inn,
    form: "таблетки",
    strength: "10 мг",
  };
}

function payload(
  products: CatalogClientIndexProduct[],
): CatalogClientIndexPayload {
  return {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: HASH,
    generatedAt: "2026-08-14T00:00:00.000Z",
    productCount: products.length,
    aliasCount: 0,
    rows: products.map(encodeCatalogClientIndexRow),
    aliases: [],
  };
}

const safetyProducts = [
  product(1, "НУРОФЕН", "Ібупрофен"),
  product(2, "ПАРАЦЕТАМОЛ", "Парацетамол"),
  product(3, "АНАЛЬГІН", "Метамізол натрію"),
  product(4, "Q", "Й"),
];

describe("catalog normalized search safety", () => {
  it("finds a wrong-layout name as layout while keeping the exact spelling exact", () => {
    const index = compileCatalogClientIndex(payload(safetyProducts));
    const layout = normalizeAndSearchCatalogClientIndex(index, "yehjaty");
    expect(layout.primary[0]?.product.tradeName).toBe("НУРОФЕН");
    expect(layout.primary[0]?.matchType).toBe("layout");
    expect(layout.primary[0]?.correctedQuery).toBe("нурофен");
    expect(layout.suggested).toEqual([]);

    const exact = normalizeAndSearchCatalogClientIndex(index, "нурофен");
    expect(exact.primary[0]?.matchType).toBe("exact");
    expect(exact.primary[0]?.product.tradeName).toBe("НУРОФЕН");
    expect(exact.suggested).toEqual([]);
  });

  it("preserves the complete existing field ranking inside direct matches", () => {
    const rankingProducts = [
      product(10, "ЕНАП", "Enalapril"),
      { ...product(11, "ЕНАП", "Enalapril"), strength: "20 мг" },
      product(12, "ЕНАЛАПРИЛ", "Enalapril"),
      product(13, "ЕНАЛАПРИЛ КРКА", "Enalapril"),
    ];
    const index = compileCatalogClientIndex(payload(rankingProducts));
    const direct = searchCatalogClientIndex(index, "ена");
    const normalized = normalizeAndSearchCatalogClientIndex(index, "ена");
    expect(
      normalized.primary.map(({ product, rank, matchedBy }) => ({
        id: product.productId,
        rank,
        matchedBy,
      })),
    ).toEqual(
      direct.items.map(({ product, rank, matchedBy }) => ({
        id: product.productId,
        rank,
        matchedBy,
      })),
    );
  });
  it("does not convert a mixed name-and-dose query", () => {
    const result = normalizeAndSearchCatalogClientIndex(
      compileCatalogClientIndex(payload(safetyProducts)),
      "нурофен 200",
    );
    expect(result.primary).toEqual([]);
    expect(result.suggested).toEqual([]);
  });

  it("returns substitution and adjacent-transposition fixes only as suggestions", () => {
    const index = compileCatalogClientIndex(payload(safetyProducts));
    for (const query of ["парацитамол", "парацетамло"]) {
      const result = normalizeAndSearchCatalogClientIndex(index, query);
      expect(result.primary).toEqual([]);
      expect(result.suggested[0]?.product.tradeName).toBe("ПАРАЦЕТАМОЛ");
      expect(result.suggested[0]?.matchType).toBe("fuzzy");
      expect(result.suggested[0]?.correctedQuery).toBe("парацетамол");
      expect(result.suggested).toHaveLength(1);
    }
  });

  it("never runs fuzzy when primary exists, for short tokens, or registration numbers", () => {
    const index = compileCatalogClientIndex(payload(safetyProducts));
    const exact = normalizeAndSearchCatalogClientIndex(index, "анальгін");
    expect(exact.primary.length).toBeGreaterThan(0);
    expect(exact.suggested).toEqual([]);

    expect(
      normalizeAndSearchCatalogClientIndex(index, "ібу").suggested,
    ).toEqual([]);
    expect(
      normalizeAndSearchCatalogClientIndex(index, "UA/4/01/02").suggested,
    ).toEqual([]);
  });

  it("deduplicates a product matched by both exact and corrected-layout passes", () => {
    const result = normalizeAndSearchCatalogClientIndex(
      compileCatalogClientIndex(payload(safetyProducts)),
      "q",
    );
    const duplicates = result.primary.filter(
      (candidate) => candidate.product.productId === id(4),
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.matchType).toBe("exact");
  });

  it("keeps Ukrainian и/і and е/є distinct in the new correction layer", () => {
    expect(normalizeCatalogSearchTokenText("ґала-на, ГАЛА’НА")).toBe(
      "галана галана",
    );
    expect(normalizeCatalogSearchTokenText("и")).not.toBe(
      normalizeCatalogSearchTokenText("і"),
    );
    expect(normalizeCatalogSearchTokenText("е")).not.toBe(
      normalizeCatalogSearchTokenText("є"),
    );
  });

  it("holds suggested implies primary empty across 100 deterministic typo cases", () => {
    const alphabet = [..."абвгдежзиклмнопрстуфхцчшщюя"];
    const generated = Array.from({ length: 100 }, (_, position) => {
      const suffix = Array.from(
        { length: 7 },
        (__, offset) =>
          alphabet[(position * 11 + offset * 7) % alphabet.length],
      ).join("");
      return product(position + 100, `ЛІК${suffix}`, `Речовина ${position}`);
    });
    const index = compileCatalogClientIndex(payload(generated));
    for (const item of generated) {
      const normalized = normalizeCatalogSearchTokenText(item.tradeName);
      const typo = `${normalized.slice(0, -1)}ь`;
      const result = normalizeAndSearchCatalogClientIndex(index, typo);
      if (result.suggested.length) expect(result.primary).toEqual([]);
    }
  });

  it("keeps normalizeAndSearch inside the persistent Worker protocol", async () => {
    const index = compileCatalogClientIndex(payload(safetyProducts));
    const worker: CatalogClientIndexSearchWorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn((message) => {
        queueMicrotask(() => {
          if ("type" in message && message.type === "initialize-search") {
            worker.onmessage?.({
              data: { status: "search-ready" },
            } as MessageEvent);
            return;
          }
          if ("type" in message && message.type === "search") {
            worker.onmessage?.({
              data: {
                status: "search-result",
                requestId: message.requestId,
                result: normalizeAndSearchCatalogClientIndex(
                  index,
                  message.query,
                  message.options,
                ),
              },
            } as MessageEvent);
          }
        });
      }),
      terminate: vi.fn(),
    };
    const searcher = createCatalogClientIndexNormalizedSearcher(
      index,
      () => worker,
    );
    const result = await searcher.search("yehjaty");
    expect(result.primary[0]?.matchType).toBe("layout");
    expect(worker.postMessage).toHaveBeenNthCalledWith(1, {
      type: "initialize-search",
      index,
    });
    expect(worker.postMessage).toHaveBeenNthCalledWith(2, {
      type: "search",
      requestId: 1,
      query: "yehjaty",
      options: undefined,
    });
    searcher.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("renders fuzzy suggestions in a separate, explicit-click section", () => {
    const index = compileCatalogClientIndex(payload(safetyProducts));
    const normalizedResult = normalizeAndSearchCatalogClientIndex(
      index,
      "парацитамол",
    );
    const html = renderToStaticMarkup(
      createElement(
        Router,
        { hook: () => ["/search", () => undefined] },
        createElement(LocalCatalogResults, {
          result: {
            query: "парацитамол",
            total: 0,
            items: [],
            durationMs: 0,
          },
          normalizedResult,
        }),
      ),
    );
    expect(html).toContain("Можливо, ви шукали:");
    expect(html).toContain("Виправлено");
    expect(html).toContain("correctedQuery=%D0%BF%D0%B0%D1%80");
    expect(html).toContain("Відкрити");
  });
});
