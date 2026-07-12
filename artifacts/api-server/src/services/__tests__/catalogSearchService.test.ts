import { describe, expect, it, vi } from "vitest";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import {
  CATALOG_BROWSE_RANK_SQL,
  assembleRegistryProducts,
  extractRegistryStrength,
  searchCatalog,
  type RegistryCatalogStore,
} from "../catalogSearchService";

const productRow = {
  registry_id: "registry-1",
  trade_name: "Nurofen",
  normalized_trade_name: "nurofen",
  inn: "Ibuprofen",
  active_ingredient: "Ibuprofen 200 mg",
  atc_code: "M01AE01",
  form: "film-coated tablets",
  registration_number: "UA/1234/01/01",
  registration_start_date: "2024-01-01",
  registration_end_date: "2029-01-01",
  source_key: "state_registry",
  registration_status: "active" as const,
};

const manufacturer = {
  product_registry_id: "registry-1",
  name: "Example Pharma",
  country: "Ukraine",
};

const approvedMapping = {
  normalized: "nurofen",
  review_status: "approved",
  ingredient_id: "ingredient-1",
  inn: "Ibuprofen",
  latin: "Ibuprofenum",
  english: "Ibuprofen",
  atc_code: "M01AE01",
};

function input(overrides: Record<string, unknown> = {}) {
  return SearchCatalogQueryParams.parse(overrides);
}

function store(
  overrides: Partial<RegistryCatalogStore> = {},
): RegistryCatalogStore {
  const item = assembleRegistryProducts(
    [productRow],
    [manufacturer],
    [approvedMapping],
  )[0];
  return {
    getCatalogTotal: vi.fn(async () => 16_533),
    searchProducts: vi.fn(async () => ({
      catalogTotal: 16_533,
      filteredTotal: 16_533,
      items: [item],
    })),
    searchIngredients: vi.fn(async () => [
      {
        resultType: "ingredient" as const,
        ingredientId: "ingredient-1",
        inn: "Ibuprofen",
        latin: "Ibuprofenum",
        english: "Ibuprofen",
        atcCode: "M01AE01",
        group: "NSAID",
        matchedName: "Nurofen",
        mappingStatus: "approved" as const,
      },
    ]),
    ...overrides,
  };
}

describe("catalog search service", () => {
  it("uses a non-positional PostgreSQL rank expression in browse mode", () => {
    expect(CATALOG_BROWSE_RANK_SQL).toBe("NULL::int");
    expect(CATALOG_BROWSE_RANK_SQL).not.toMatch(/^\d+$/);
  });

  it("extracts strength without inventing missing values", () => {
    expect(extractRegistryStrength("Ibuprofen 200 mg", "tablets")).toBe("200 mg");
    expect(extractRegistryStrength("solution", "ampoule")).toBeNull();
  });

  it("attaches a single approved internal mapping", () => {
    const [result] = assembleRegistryProducts(
      [productRow],
      [manufacturer],
      [approvedMapping],
    );
    expect(result.mappingStatus).toBe("approved");
    expect(result.approvedMapping?.inn).toBe("Ibuprofen");
    expect(result.manufacturers).toEqual([
      { name: "Example Pharma", country: "Ukraine" },
    ]);
  });

  it("keeps unmapped and ambiguous registry rows unconfirmed", () => {
    const [unmapped] = assembleRegistryProducts([productRow], [], []);
    const [ambiguous] = assembleRegistryProducts(
      [productRow],
      [],
      [
        approvedMapping,
        {
          ...approvedMapping,
          ingredient_id: "ingredient-2",
          inn: "Another ingredient",
        },
      ],
    );
    expect(unmapped).toMatchObject({
      mappingStatus: "unmapped",
      approvedMapping: null,
    });
    expect(ambiguous).toMatchObject({
      mappingStatus: "ambiguous",
      approvedMapping: null,
    });
    for (const review_status of [
      "pending",
      "needs_review",
      "quarantined",
    ]) {
      const [unapproved] = assembleRegistryProducts(
        [productRow],
        [],
        [{ ...approvedMapping, review_status }],
      );
      expect(unapproved).toMatchObject({
        mappingStatus: "unmapped",
        approvedMapping: null,
      });
    }
  });

  it("does not merge distinct forms or strengths", () => {
    const results = assembleRegistryProducts(
      [
        productRow,
        {
          ...productRow,
          registry_id: "registry-2",
          active_ingredient: "Ibuprofen 400 mg",
          form: "capsules",
        },
      ],
      [],
      [],
    );
    expect(results).toHaveLength(2);
    expect(results.map((item) => item.strength)).toEqual(["200 mg", "400 mg"]);
    expect(results.map((item) => item.dosageForm)).toEqual([
      "film-coated tablets",
      "capsules",
    ]);
  });

  it("returns the first bounded browse page and production total", async () => {
    const result = await searchCatalog(input(), store());
    expect(result.runtimeMode).toBe("db");
    expect(result.catalogTotal).toBe(16_533);
    expect(result.registryProducts).toMatchObject({
      total: 16_533,
      page: 1,
      pageSize: 25,
      totalPages: 662,
      hasNext: true,
    });
    expect(result.registryProducts.items).toHaveLength(1);
  });

  it("returns combined approved ingredients and registry products", async () => {
    const result = await searchCatalog(
      input({ q: "Nurofen", type: "all" }),
      store(),
    );
    expect(result.ingredients[0]).toMatchObject({
      resultType: "ingredient",
      mappingStatus: "approved",
    });
    expect(result.registryProducts.items[0]).toMatchObject({
      resultType: "registry_product",
      mappingStatus: "approved",
    });
  });

  it("uses count-only mode when browsing ingredients", async () => {
    const testStore = store();
    const result = await searchCatalog(
      input({ type: "ingredients", pageSize: 50 }),
      testStore,
    );
    expect(testStore.searchProducts).not.toHaveBeenCalled();
    expect(testStore.getCatalogTotal).toHaveBeenCalledOnce();
    expect(result.catalogTotal).toBe(16_533);
    expect(result.registryProducts.items).toEqual([]);
    expect(result.ingredients).toHaveLength(1);
  });

  it("rejects unbounded page sizes in the generated contract", () => {
    expect(
      SearchCatalogQueryParams.safeParse({ pageSize: "100" }).success,
    ).toBe(false);
    expect(
      SearchCatalogQueryParams.safeParse({ pageSize: "50" }).success,
    ).toBe(true);
    expect(
      SearchCatalogQueryParams.safeParse({ page: "1.5" }).success,
    ).toBe(false);
    expect(
      SearchCatalogQueryParams.safeParse({ page: "10001" }).success,
    ).toBe(false);
  });

  it("sanitizes database failures and never leaks environment or paths", async () => {
    const failingStore = store({
      searchProducts: vi.fn(async () => {
        throw new Error("postgresql://secret@host/C:/private/catalog");
      }),
    });
    const result = await searchCatalog(
      input({ type: "registry_products" }),
      failingStore,
    );
    const serialized = JSON.stringify(result);
    expect(result.runtimeMode).toBe("static");
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("C:/private");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(result.warnings).toEqual([
      "Production registry is unavailable; static reference fallback is active.",
    ]);
  });
});
