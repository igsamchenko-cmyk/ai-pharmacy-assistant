import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import type { ProductCard } from "@workspace/api-client-react";
import {
  catalogCompositionKey,
  type CatalogClientIndexProduct,
  type CatalogClientIndexSearchResult,
} from "@workspace/catalog-index";

/**
 * The tab issues two distinct lookups — one for the position's own index row
 * (by productId, to read its composition key) and one for peers — so the stub
 * answers per query rather than returning one fixed result.
 */
const indexRows: { current: CatalogClientIndexProduct[] } = { current: [] };

function searchStub(query: string): CatalogClientIndexSearchResult {
  const items = indexRows.current
    .filter(
      (product) =>
        product.productId === query ||
        (Boolean(product.compositionKey) && product.compositionKey === query) ||
        product.inn === query,
    )
    .map((product) => ({
      product,
      rank: 0,
      matchedBy: "inn_exact" as const,
    }));
  return { query, total: items.length, items, durationMs: 0 };
}

vi.mock("@/lib/catalog-client-index", () => ({
  useCatalogClientIndex: () => ({
    status: "ready",
    search: (query: string) => searchStub(query),
  }),
}));

import { ProductAnalogsTab } from "./analogs-tab";

function candidate(
  productId: string,
  tradeName: string,
  overrides: Partial<CatalogClientIndexProduct> = {},
): CatalogClientIndexProduct {
  return {
    productId,
    registration: "UA/1/01/01",
    tradeName,
    inn: "Ібупрофен",
    form: "таблетки, вкриті оболонкою",
    strength: "200 мг",
    compositionKey: "",
    ...overrides,
  };
}

function card(overrides: Partial<ProductCard["identity"]> = {}): ProductCard {
  return {
    identity: {
      resultType: "registry_product",
      id: "A".repeat(32),
      tradeName: "ТЕСТОВИЙ ПРЕПАРАТ",
      inn: "Ібупрофен",
      activeIngredient: "Ібупрофен",
      atcCode: "M01AE01",
      dosageForm: "таблетки, вкриті оболонкою",
      strength: "200 мг",
      manufacturers: [],
      registration: {
        number: "UA/1/01/01",
        startDate: "2025-01-01",
        endDate: "2030-01-01",
        status: "active",
      },
      source: { key: "drlz", label: "Державний реєстр ЛЗ" },
      mappingStatus: "approved",
      sourceRecordCount: 1,
      ...overrides,
    },
  } as unknown as ProductCard;
}

function render(productCard: ProductCard) {
  return renderToStaticMarkup(
    createElement(
      Router,
      { ssrPath: "/products/test" },
      createElement(ProductAnalogsTab, { card: productCard }),
    ),
  );
}

const SELF_ID = "A".repeat(32);
const RENNIE_KEY = catalogCompositionKey(
  "Кальцію карбонат + МАГНІЮ КАРБОНАТ ВАЖКИЙ",
);

describe("ProductAnalogsTab", () => {
  it("shows the real INN-matched analogs when the МНН is a specific substance", () => {
    indexRows.current = [candidate("B".repeat(32), "Бренд Б")];
    const html = render(card());
    expect(html).toContain("Бренд Б");
    expect(html).toContain("Реєстрові варіанти за МНН");
    expect(html).not.toContain("МНН не деталізовано в реєстрі");
    expect(html).not.toContain("Підібрано за складом");
  });

  it("refuses to group unrelated products under a non-specific placeholder INN", () => {
    indexRows.current = [
      candidate(SELF_ID, "РЕННІ", { inn: "Comb drug" }),
      candidate("C".repeat(32), "А-ДІСТОН", { inn: "Comb drug" }),
      candidate("D".repeat(32), "АВІСАН", { inn: "Comb drug" }),
    ];
    const html = render(card({ inn: "Comb drug", activeIngredient: "" }));
    expect(html).toContain("МНН не деталізовано в реєстрі");
    expect(html).not.toContain("А-ДІСТОН");
    expect(html).not.toContain("АВІСАН");
    expect(html).toContain("0 варіантів");
  });

  it("matches a placeholder-INN product by its resolved composition", () => {
    // РЕННІ: registry МНН is "Comb drug", but the price-catalog composition
    // groups its own flavours together with РЕММАКС-КВ and nothing else.
    indexRows.current = [
      candidate(SELF_ID, "РЕННІ® БЕЗ ЦУКРУ", {
        inn: "Comb drug",
        form: "таблетки жувальні",
        strength: "680 мг/80 мг",
        compositionKey: RENNIE_KEY,
      }),
      candidate("E".repeat(32), "РЕММАКС-КВ", {
        inn: "Comb drug",
        form: "таблетки жувальні",
        strength: "680 мг/80 мг",
        compositionKey: RENNIE_KEY,
      }),
      candidate("F".repeat(32), "А-ДІСТОН", {
        inn: "Comb drug",
        compositionKey: catalogCompositionKey("Інше + Ще інше"),
      }),
    ];
    const html = render(
      card({
        inn: "Comb drug",
        activeIngredient: "",
        dosageForm: "таблетки жувальні",
        strength: "680 мг/80 мг",
      }),
    );

    expect(html).toContain("РЕММАКС-КВ");
    expect(html).toContain("Підібрано за складом");
    expect(html).toContain("Реєстрові варіанти за складом");
    expect(html).toContain("Національного каталогу цін МОЗ");
    expect(html).toContain("1 варіантів");
    // The unrelated placeholder peer must not leak into a composition group.
    expect(html).not.toContain("А-ДІСТОН");
    expect(html).not.toContain("МНН не деталізовано в реєстрі");
  });
});
