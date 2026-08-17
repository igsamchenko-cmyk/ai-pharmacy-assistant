import { describe, expect, it } from "vitest";
import {
  catalogCompositionKey,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";
import {
  catalogInnSpecificity,
  classifyRegistryAnalogs,
  isNonSpecificInn,
} from "./product-analogs";

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
    manufacturer: "Виробник",
    registrationValidity: "2030-01-01",
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

  it("still groups a class-combination INN, unlike a bare placeholder", () => {
    // "Valsartan and diuretics" names a substance, so the group is meaningful
    // as a class even without a composition — the tab labels it as such.
    const classBase = {
      ...base,
      inn: "Valsartan and diuretics",
      compositionKey: "",
    };
    const peer = candidate("M".repeat(32), "ВАЛСАКОР", {
      inn: "Valsartan and diuretics",
    });
    expect(classifyRegistryAnalogs(classBase, [peer])).toEqual({
      full: [peer],
      partial: [],
    });
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

describe("catalogInnSpecificity", () => {
  it("classifies WHO-style class combinations as partial, not specific", () => {
    // Real registry values: they name one substance plus an unresolved class,
    // so two products sharing the string may hold different second components.
    for (const inn of [
      "Valsartan and diuretics",
      "Ramipril and diuretics",
      "Timolol, combinations",
      "Paracetamol, combinations excl. psycholeptics",
      "Barbiturates in combination with other drugs",
    ]) {
      expect(catalogInnSpecificity(inn)).toBe("partial_combination");
    }
  });

  it("keeps a name that enumerates its components specific", () => {
    expect(
      catalogInnSpecificity(
        "Vitamin B1 in combination with vitamin B6 and/or vitamin B12",
      ),
    ).toBe("specific");
    expect(
      catalogInnSpecificity("Amoxicillin and beta-lactamase inhibitor"),
    ).toBe("specific");
  });

  it("separates a bare placeholder from a class combination", () => {
    expect(catalogInnSpecificity("Comb drug")).toBe("placeholder");
    expect(catalogInnSpecificity("Ібупрофен")).toBe("specific");
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
