import { describe, expect, it } from "vitest";
import {
  catalogCompositionKey,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";
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
    compositionKey: "",
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

  it("groups a placeholder-INN product by composition when one is resolved", () => {
    // РЕННІ: the registry МНН is "Comb drug", but the composition key resolved
    // from the МОЗ price catalog is what actually identifies its analogs.
    const rennie = catalogCompositionKey(
      "Кальцію карбонат + МАГНІЮ КАРБОНАТ ВАЖКИЙ",
    );
    const combBase = {
      ...base,
      inn: "Comb drug",
      form: "таблетки жувальні",
      strength: "680 мг/80 мг",
      compositionKey: rennie,
    };
    const sameComposition = candidate("I".repeat(32), "РЕММАКС-КВ", {
      inn: "Comb drug",
      form: "таблетки жувальні",
      strength: "680 мг/80 мг",
      compositionKey: rennie,
    });
    const otherFlavour = candidate("J".repeat(32), "РЕННІ З МЕНТОЛОМ", {
      inn: "Comb drug",
      form: "таблетки жувальні",
      strength: "500 мг/100 мг",
      compositionKey: rennie,
    });
    const unrelatedPlaceholder = candidate("K".repeat(32), "А-ДІСТОН", {
      inn: "Comb drug",
      compositionKey: catalogCompositionKey("Щось інше + Ще одне"),
    });

    expect(
      classifyRegistryAnalogs(combBase, [
        sameComposition,
        otherFlavour,
        unrelatedPlaceholder,
      ]),
    ).toEqual({ full: [sameComposition], partial: [otherFlavour] });
  });

  it("does not fall back to the placeholder INN when no composition is resolved", () => {
    const combBase = { ...base, inn: "Comb drug", compositionKey: "" };
    const placeholderPeer = candidate("L".repeat(32), "АВІСАН", {
      inn: "Comb drug",
    });
    expect(classifyRegistryAnalogs(combBase, [placeholderPeer])).toEqual({
      full: [],
      partial: [],
    });
  });
});

describe("catalogCompositionKey", () => {
  it("is independent of component order and spelling noise", () => {
    expect(
      catalogCompositionKey("Кальцію карбонат + МАГНІЮ КАРБОНАТ ВАЖКИЙ"),
    ).toBe(catalogCompositionKey("магнію карбонат важкий + кальцію карбонат"));
  });

  it("keeps commas inside a chemical name instead of splitting on them", () => {
    // "2,4-дихлорбензиловий спирт" is one ingredient, not two.
    const key = catalogCompositionKey(
      "2,4-ДИХЛОРБЕНЗИЛОВИЙ СПИРТ + АМІЛМЕТАКРЕЗОЛ",
    );
    expect(key.split(";")).toHaveLength(2);
    expect(key).toContain("2,4дихлорбензиловииспирт");
  });

  it("treats a semicolon as a component separator and deduplicates", () => {
    expect(
      catalogCompositionKey("Аспірин; Аспірин + Кофеїн").split(";"),
    ).toEqual(["аспірин", "кофеін"]);
  });

  it("refuses an empty or unusably long composition", () => {
    expect(catalogCompositionKey("")).toBe("");
    expect(catalogCompositionKey("   +   ")).toBe("");
    const homeopathic = Array.from(
      { length: 40 },
      (_unused, index) => `компонент${index}`,
    ).join(" + ");
    expect(catalogCompositionKey(homeopathic)).toBe("");
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
