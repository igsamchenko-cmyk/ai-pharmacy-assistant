import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import type { ProductCard } from "@workspace/api-client-react";
import type {
  CatalogClientIndexProduct,
  CatalogClientIndexSearchResult,
} from "@workspace/catalog-index";

const searchResult: { current: CatalogClientIndexSearchResult } = {
  current: { query: "", total: 0, items: [], durationMs: 0 },
};

vi.mock("@/lib/catalog-client-index", () => ({
  useCatalogClientIndex: () => ({
    status: "ready",
    search: () => searchResult.current,
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

describe("ProductAnalogsTab", () => {
  it("shows the real INN-matched analogs when the МНН is a specific substance", () => {
    searchResult.current = {
      query: "ібупрофен",
      total: 1,
      items: [
        {
          product: candidate("B".repeat(32), "Бренд Б"),
          rank: 1,
          matchedBy: "inn",
        },
      ],
      durationMs: 1,
    };
    const html = render(card());
    expect(html).toContain("Бренд Б");
    expect(html).not.toContain("МНН не деталізовано в реєстрі");
  });

  it("refuses to group unrelated products under a non-specific placeholder INN", () => {
    searchResult.current = {
      query: "comb drug",
      total: 100,
      items: [
        {
          product: candidate("C".repeat(32), "А-ДІСТОН", { inn: "Comb drug" }),
          rank: 1,
          matchedBy: "inn",
        },
        {
          product: candidate("D".repeat(32), "АВІСАН", { inn: "Comb drug" }),
          rank: 1,
          matchedBy: "inn",
        },
      ],
      durationMs: 1,
    };
    const html = render(card({ inn: "Comb drug", activeIngredient: "" }));
    expect(html).toContain("МНН не деталізовано в реєстрі");
    expect(html).not.toContain("А-ДІСТОН");
    expect(html).not.toContain("АВІСАН");
    expect(html).toContain("0 варіантів");
  });
});
