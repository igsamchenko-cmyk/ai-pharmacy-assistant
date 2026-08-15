import { describe, expect, it } from "vitest";
import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import { classifyRegistryAnalogs } from "./product-analogs";

const base = {
  productId: "A".repeat(32),
  inn: "Ібупрофен",
  form: "таблетки, вкриті оболонкою",
  strength: "200 мг",
};

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
    form: "таблетки вкриті оболонкою",
    strength: "200 мг",
    ...overrides,
  };
}

describe("registry analog classification", () => {
  it("preserves exact and partial groups without including another INN", () => {
    const exact = candidate("B".repeat(32), "Бренд Б");
    const partial = candidate("C".repeat(32), "Бренд В", {
      strength: "400 мг",
    });
    const anotherInn = candidate("D".repeat(32), "Не аналог", {
      inn: "Парацетамол",
    });
    expect(classifyRegistryAnalogs(base, [exact, partial, anotherInn])).toEqual(
      { full: [exact], partial: [partial] },
    );
  });

  it("excludes the base product, deduplicates and sorts by trade name", () => {
    const zeta = candidate("E".repeat(32), "Я-Бренд");
    const alpha = candidate("F".repeat(32), "А-Бренд");
    expect(
      classifyRegistryAnalogs(base, [
        candidate(base.productId, "Поточний"),
        zeta,
        alpha,
        zeta,
      ]).full.map((product) => product.tradeName),
    ).toEqual(["А-Бренд", "Я-Бренд"]);
  });
});
