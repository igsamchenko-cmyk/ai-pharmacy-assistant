import { describe, expect, it } from "vitest";
import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import { classifyRegistryAnalogs, isNonSpecificInn } from "./product-analogs";

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

  it("never groups unrelated products sharing a non-specific placeholder INN", () => {
    // "Comb drug" is a literal placeholder the official registry writes into
    // the МНН field for combination products whose composition isn't
    // decomposed into a single substance — not a real analog identity.
    const combBase = { ...base, inn: "Comb drug" };
    const unrelatedOne = candidate("G".repeat(32), "А-ДІСТОН", {
      inn: "Comb drug",
      form: "краплі",
      strength: "",
    });
    const unrelatedTwo = candidate("H".repeat(32), "АВІСАН", {
      inn: "Comb drug",
      form: "порошок",
      strength: "",
    });
    expect(
      classifyRegistryAnalogs(combBase, [unrelatedOne, unrelatedTwo]),
    ).toEqual({ full: [], partial: [] });
  });
});

describe("isNonSpecificInn", () => {
  it("flags known registry placeholder values regardless of case or spacing", () => {
    expect(isNonSpecificInn("Comb drug")).toBe(true);
    expect(isNonSpecificInn("COMBINATION")).toBe(true);
    expect(isNonSpecificInn("mono")).toBe(true);
    expect(isNonSpecificInn("Other")).toBe(true);
    expect(isNonSpecificInn("various")).toBe(true);
  });

  it("flags empty or too-short values", () => {
    expect(isNonSpecificInn("")).toBe(true);
    expect(isNonSpecificInn("а")).toBe(true);
  });

  it("does not flag real substance names", () => {
    expect(isNonSpecificInn("Ібупрофен")).toBe(false);
    expect(isNonSpecificInn("Парацетамол")).toBe(false);
    expect(isNonSpecificInn("Мультіензими")).toBe(false);
  });
});
