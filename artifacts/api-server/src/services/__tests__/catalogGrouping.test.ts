import { describe, expect, it } from "vitest";
import type { RegistryProductResult } from "@workspace/api-zod";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import { groupRegistryProducts } from "../catalogGrouping";

const approvedMapping = {
  ingredientId: "ingredient-amlodipine",
  inn: "Amlodipine",
  latin: "Amlodipinum",
  english: "Amlodipine",
  atcCode: "C08CA01",
};

function product(
  id: string,
  strength: string,
  registrationNumber: string,
  overrides: Partial<RegistryProductResult> = {},
): RegistryProductResult {
  return {
    resultType: "registry_product",
    id,
    tradeName: "Amlodipine Pharma",
    inn: "Amlodipine",
    activeIngredient: `Amlodipine ${strength}`,
    atcCode: "C08CA01",
    dosageForm: "tablets",
    strength,
    manufacturers: [{ name: "Example Pharma", country: "Ukraine" }],
    registration: {
      number: registrationNumber,
      startDate: "2024-01-01",
      endDate: "2029-01-01",
      status: "active",
    },
    source: { key: "state_registry", label: "State registry" },
    mappingStatus: "approved",
    approvedMapping,
    sourceRecordCount: 1,
    nationalListStatus: "not_applicable",
    nationalListRelease: null,
    nationalListMatchReason: "No active release.",
    nationalListSection: null,
    nationalListSource: null,
    nationalListCheckedAt: null,
    nationalListMatchDetails: null,
    instructionAvailable: false,
    ...overrides,
  };
}

function groupingInput(overrides: Record<string, unknown> = {}) {
  return SearchCatalogQueryParams.parse({
    q: "Amlodipine",
    type: "registry_products",
    view: "grouped",
    ...overrides,
  });
}

describe("registry catalog grouping", () => {
  it("puts an exact brand first and embeds its variants in the initial response", () => {
    const related = Array.from({ length: 12 }, (_, index) => product(
      "related-" + index,
      "5 mg",
      "UA/related/" + index,
      { tradeName: "Brand " + String(index).padStart(2, "0") },
    ));
    const products = [
      ...related,
      product("exact-5", "5 mg", "UA/exact/5", {
        tradeName: "EXACT BRAND®",
      }),
      product("exact-10", "10 mg", "UA/exact/10", {
        tradeName: "EXACT BRAND®",
      }),
    ];

    const result = groupRegistryProducts(
      products,
      groupingInput({ q: "Exact Brand", variantPageSize: 25 }),
    );
    const group = result.groups.items[0];
    const exactTrade = group.tradeNames.items[0];

    expect(exactTrade.tradeName).toBe("EXACT BRAND®");
    expect(exactTrade.variants).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 25,
      hasNext: false,
    });
    expect(exactTrade.variants?.items.map((item) => item.strength).sort()).toEqual([
      "10 mg",
      "5 mg",
    ]);
    expect(group.tradeNames.hasNext).toBe(true);
    expect(
      group.tradeNames.items.slice(1).every((trade) => trade.variants === null),
    ).toBe(true);
  });
  it("groups by composition and trade name while preserving distinct strengths", () => {
    const products = [
      product("p-1", "5 mg", "UA/1"),
      product("p-2", "10 mg", "UA/2"),
      product("p-2-duplicate", "10 mg", "UA/2"),
      product("p-3", "5 mg + 80 mg", "UA/3", {
        tradeName: "Amlodipine Valsartan",
        inn: "Amlodipine + Valsartan",
        activeIngredient: "Amlodipine 5 mg + Valsartan 80 mg",
        mappingStatus: "unmapped",
        approvedMapping: null,
      }),
    ];

    const first = groupRegistryProducts(products, groupingInput());
    expect(first.summary.totalRegistryPositions).toBe(4);
    expect(first.summary.monotherapyCount).toBe(3);
    expect(first.summary.combinationCount).toBe(1);
    expect(first.groups.total).toBe(2);

    const mono = first.groups.items.find((group) => group.compositionType === "monotherapy");
    const trade = mono?.tradeNames.items[0];
    expect(trade?.summary.uniqueStrengths).toBe(2);
    expect(trade?.variants).toBeNull();

    const expanded = groupRegistryProducts(products, groupingInput({
      groupKey: mono?.key,
      tradeNameKey: trade?.key,
    }));
    const variants = expanded.groups.items
      .find((group) => group.key === mono?.key)
      ?.tradeNames.items.find((item) => item.key === trade?.key)
      ?.variants;

    expect(variants?.total).toBe(2);
    expect(variants?.totalRegistryPositions).toBe(3);
    expect(variants?.items.map((item) => item.strength).sort()).toEqual(["10 mg", "5 mg"]);
    expect(variants?.items.find((item) => item.strength === "10 mg")?.sourceRecordCount).toBe(2);
  });

  it("keeps manufacturer and registration variants distinct", () => {
    const products = [
      product("p-1", "5 mg", "UA/1"),
      product("p-2", "5 mg", "UA/2"),
      product("p-3", "5 mg", "UA/1", {
        manufacturers: [{ name: "Second Pharma", country: "Poland" }],
      }),
    ];
    const first = groupRegistryProducts(products, groupingInput());
    const group = first.groups.items[0];
    const trade = group.tradeNames.items[0];
    const expanded = groupRegistryProducts(products, groupingInput({
      groupKey: group.key,
      tradeNameKey: trade.key,
    }));
    const variants = expanded.groups.items[0].tradeNames.items[0].variants;

    expect(variants?.total).toBe(3);
    expect(variants?.totalRegistryPositions).toBe(3);
  });

  it("paginates groups and preserves the bounded safety signal", () => {
    const products = Array.from({ length: 12 }, (_, index) => product(
      `p-${index}`,
      `${index + 1} mg`,
      `UA/${index}`,
      { inn: `Ingredient ${index}`, tradeName: `Trade ${index}` },
    ));
    const first = groupRegistryProducts(products, groupingInput(), false);
    const second = groupRegistryProducts(products, groupingInput({ groupPage: 2 }), false);

    expect(first.groups).toMatchObject({ total: 12, page: 1, pageSize: 10, hasNext: true });
    expect(first.groups.items).toHaveLength(10);
    expect(second.groups.items).toHaveLength(2);
    expect(first.bounded).toBe(false);
    expect(first.summary.totalRegistryPositions).toBe(12);
  });

  it("applies composition and approved-mapping filters without promoting unmapped rows", () => {
    const products = [
      product("approved", "5 mg", "UA/1"),
      product("combo", "5 mg + 80 mg", "UA/2", {
        inn: "Amlodipine + Valsartan",
        mappingStatus: "unmapped",
        approvedMapping: null,
      }),
    ];
    const combinations = groupRegistryProducts(products, groupingInput({
      compositionType: "combination",
      mappingStatus: "unmapped",
    }));
    const approved = groupRegistryProducts(products, groupingInput({
      mappingStatus: "approved",
    }));

    expect(combinations.summary.totalRegistryPositions).toBe(1);
    expect(combinations.groups.items[0].mappingStatus).toBe("unmapped");
    expect(approved.summary.totalRegistryPositions).toBe(1);
    expect(approved.summary.unmappedCount).toBe(0);
  });

  it("uses the official active ingredient when the INN field is blank", () => {
    const products = [
      product("active-only", "5 mg", "UA/active", {
        inn: "",
        activeIngredient: "Amlodipine",
      }),
      product("unknown", "", "UA/unknown", {
        inn: "",
        activeIngredient: "",
        mappingStatus: "unmapped",
        approvedMapping: null,
      }),
      product("dosage-ratio", "5 mg/5 ml", "UA/ratio", {
        inn: "",
        activeIngredient: "Amlodipine 5 mg/5 ml",
      }),
      product("decimal-dose", "2,5 mg", "UA/decimal", {
        inn: "",
        activeIngredient: "Amlodipine 2,5 mg",
      }),
    ];

    const result = groupRegistryProducts(products, groupingInput());
    expect(result.summary.monotherapyCount).toBe(3);
    expect(result.summary.unknownCompositionCount).toBe(1);
    expect(
      result.groups.items.find((group) => group.compositionType === "monotherapy")
        ?.officialCompositions,
    ).toContain("Amlodipine");
  });
});
