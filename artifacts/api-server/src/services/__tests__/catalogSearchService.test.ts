import { describe, expect, it, vi } from "vitest";
import {
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import {
  CATALOG_BROWSE_RANK_SQL,
  catalogAliasQueryKeys,
  catalogCompositionSearchTerms,
  createPostgresRegistryCatalogStore,
  assembleRegistryProducts,
  extractRegistryStrength,
  isExactFastPathEligible,
  registrySearchCacheKey,
  resetRegistrySearchCachesForTests,
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

  it("derives canonical dictionary keys for unique one-edit queries", () => {
    expect(catalogAliasQueryKeys("парацитамол")).toEqual(
      expect.arrayContaining(["парацитамол", "парацетамол", "paracetamol"]),
    );
    expect(catalogAliasQueryKeys("еліківс")).toEqual(
      expect.arrayContaining(["еліківс", "еліквіс", "апіксабан", "apixaban"]),
    );
    expect(catalogAliasQueryKeys("форксига")).toEqual(
      expect.arrayContaining(["форксига", "форксіга", "дапагліфлозин"]),
    );
    expect(catalogAliasQueryKeys("нурофен")).toEqual(
      expect.arrayContaining(["нурофен", "нурофєн", "ібупрофен", "ibuprofen"]),
    );
    expect(catalogAliasQueryKeys("vaccin")).toEqual(["vaccin"]);
    expect(catalogAliasQueryKeys("accident")).toEqual(["accident"]);
    expect(catalogAliasQueryKeys("ACC")).toEqual(["acc"]);
  });

  it("builds order-independent terms only for explicit combinations", () => {
    expect(
      catalogCompositionSearchTerms("Амоксицилін + клавуланова кислота"),
    ).toEqual(["амоксицилін", "клавулановакислота"]);
    expect(
      catalogCompositionSearchTerms("клавуланова кислота / амоксицилін"),
    ).toEqual(["клавулановакислота", "амоксицилін"]);
    expect(
      catalogCompositionSearchTerms(
        "ОКСАЛІПЛАТИНУМ АККОРД/OXALIPLATINUM ACCORD",
      ),
    ).toEqual([]);
    expect(catalogCompositionSearchTerms("ОНКОНАЗЕ 10 /ONCONASE 10")).toEqual(
      [],
    );
    expect(catalogCompositionSearchTerms("ОНКАСПАР/ONCASPAR")).toEqual([]);
    expect(
      catalogCompositionSearchTerms("КАПЕЦИТАБІН АККОРД/CAPECITABINE ACCORD"),
    ).toEqual([]);
    expect(catalogCompositionSearchTerms("Амлодипін / Valsartan")).toEqual([
      "амлодипін",
      "valsartan",
    ]);
    expect(catalogCompositionSearchTerms("Метформін")).toEqual([]);
    expect(catalogCompositionSearchTerms("Amlodipine 5 mg / 5 ml")).toEqual([]);
    expect(catalogCompositionSearchTerms("Amlodipine 2,5 mg")).toEqual([]);
    expect(catalogCompositionSearchTerms("UA/1234/01/01")).toEqual([]);
  });

  it("extracts strength without inventing missing values", () => {
    expect(extractRegistryStrength("Ibuprofen 200 mg", "tablets")).toBe(
      "200 mg",
    );
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

  it("hydrates approved mappings across legacy trademark keys", () => {
    const [result] = assembleRegistryProducts(
      [
        {
          ...productRow,
          registry_id: "registry-trademark",
          trade_name: "АМОКСИКЛАВ®",
          normalized_trade_name: "амоксиклав®",
          inn: "Amoxicillin + clavulanic acid",
          active_ingredient: "Amoxicillin + clavulanic acid",
        },
      ],
      [],
      [
        {
          ...approvedMapping,
          normalized: "амоксиклав",
          inn: "Amoxicillin + clavulanic acid",
        },
      ],
    );

    expect(result.mappingStatus).toBe("approved");
    expect(result.approvedMapping?.inn).toBe("Amoxicillin + clavulanic acid");
  });

  it("attaches one bounded exact National List result from the batch query", () => {
    const [result] = assembleRegistryProducts(
      [
        {
          ...productRow,
          national_list_status: "exact" as const,
          national_list_reason: "INN, form, route and strength match.",
          national_list_checked_at: "2026-07-13T00:00:00.000Z",
          national_list_release_id: "ua-national-list-2025-10-10",
          national_list_title:
            "Національний перелік основних лікарських засобів",
          national_list_act_number: "333",
          national_list_act_date: "2009-03-25",
          national_list_revision_date: "2025-10-10",
          national_list_effective_date: "2025-10-10",
          national_list_source_url:
            "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF#Text",
          national_list_section: "II. Знеболення",
          national_list_official_name: "Ібупрофен",
          national_list_ingredients_json: JSON.stringify(["Ibuprofen"]),
          national_list_dosage_forms_json: JSON.stringify(["таблетки"]),
          national_list_routes_json: JSON.stringify(["oral"]),
          national_list_strengths_json: JSON.stringify(["200 мг"]),
          national_list_ingredient_match: "match" as const,
          national_list_form_match: "match" as const,
          national_list_route_match: "match" as const,
          national_list_strength_match: "match" as const,
        },
      ],
      [],
      [],
    );
    expect(result).toMatchObject({
      nationalListStatus: "exact",
      nationalListRelease: "ua-national-list-2025-10-10",
      nationalListSource: { actNumber: "333" },
      nationalListMatchDetails: {
        officialName: "Ібупрофен",
        strengthMatch: "match",
      },
    });
  });

  it("sanitizes National List metadata before returning it to the API", () => {
    const [result] = assembleRegistryProducts(
      [
        {
          ...productRow,
          national_list_status: "exact" as const,
          national_list_reason: "DATABASE_URL=postgresql://secret@host/db",
          national_list_release_id: "C:/private/release",
          national_list_title: "api_key=secret",
          national_list_act_number: "333",
          national_list_act_date: "2009-03-25",
          national_list_revision_date: "2025-10-10",
          national_list_effective_date: "2025-10-10",
          national_list_source_url:
            "https://zakon.rada.gov.ua/laws/show/333?token=secret",
          national_list_section: "/opt/render/project/src/data",
          national_list_official_name: "C:/private/list",
          national_list_ingredients_json: JSON.stringify([
            "Ibuprofen",
            "Bearer secret-token",
          ]),
        },
      ],
      [],
      [],
    );
    expect(result).toMatchObject({
      nationalListRelease: null,
      nationalListMatchReason:
        "National-list status is unavailable for this product.",
      nationalListSection: null,
      nationalListSource: null,
      nationalListMatchDetails: null,
    });
    const serialized = JSON.stringify(result);
    for (const unsafe of [
      "DATABASE_URL",
      "postgresql://",
      "api_key",
      "Bearer",
      "C:/",
      "/opt/",
    ]) {
      expect(serialized).not.toContain(unsafe);
    }
  });

  it("attaches an approved mapping through the registry INN alias", () => {
    const [result] = assembleRegistryProducts(
      [productRow],
      [],
      [{ ...approvedMapping, normalized: "ibuprofen" }],
    );
    expect(result).toMatchObject({
      mappingStatus: "approved",
      approvedMapping: { ingredientId: "ingredient-1" },
    });
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
    for (const review_status of ["pending", "needs_review", "quarantined"]) {
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

  it("sanitizes unsafe registry source metadata", () => {
    const [result] = assembleRegistryProducts(
      [{ ...productRow, source_key: "postgresql://secret@host/C:/private" }],
      [],
      [],
    );
    expect(result.source.key).toBe("state_registry");
    expect(JSON.stringify(result)).not.toContain("postgresql://");
    expect(JSON.stringify(result)).not.toContain("C:/private");
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
    expect(result.view).toBe("grouped");
    expect(result.registryProducts.items).toEqual([]);
    expect(result.registryGroups?.groups.items[0]).toMatchObject({
      compositionType: "monotherapy",
      mappingStatus: "approved",
    });
    expect(result.registryGroups?.summary.totalRegistryPositions).toBe(1);
    expect(SearchCatalogResponse.safeParse(result).success).toBe(true);
  });

  it("returns one compact exact product without the grouped pipeline", async () => {
    const item = assembleRegistryProducts(
      [productRow],
      [manufacturer],
      [approvedMapping],
    )[0];
    const exact = vi.fn(async () => ({
      catalogTotal: 16_533,
      filteredTotal: 1,
      items: [item],
    }));
    const grouped = vi.fn();
    const flat = vi.fn();
    const testStore = store({
      findUniqueExactProduct: exact,
      searchProductsForGrouping: grouped,
      searchProducts: flat,
    });

    const result = await searchCatalog(
      input({
        q: "UA/1234/01/01",
        type: "registry_products",
        view: "grouped",
      }),
      testStore,
    );

    expect(result.view).toBe("flat");
    expect(result.registryProducts).toMatchObject({ total: 1, hasNext: false });
    expect(result.registryProducts.items[0]?.id).toBe("registry-1");
    expect(exact).toHaveBeenCalledOnce();
    expect(grouped).not.toHaveBeenCalled();
    expect(flat).not.toHaveBeenCalled();
  });

  it("falls back unchanged when an exact match is ambiguous", async () => {
    const testStore = store({
      findUniqueExactProduct: vi.fn(async () => null),
      searchProductsForGrouping: vi.fn(async () => ({
        catalogTotal: 16_533,
        filteredTotal: 1,
        items: assembleRegistryProducts(
          [productRow],
          [manufacturer],
          [approvedMapping],
        ),
        bounded: true,
      })),
    });
    const result = await searchCatalog(
      input({ q: "Ibuprofen", type: "registry_products", view: "grouped" }),
      testStore,
    );
    expect(result.view).toBe("grouped");
    expect(result.registryGroups?.summary.totalRegistryPositions).toBe(1);
    expect(testStore.searchProductsForGrouping).toHaveBeenCalledOnce();
  });

  it("bypasses the exact path when result filters are active", async () => {
    const exact = vi.fn();
    const testStore = store({ findUniqueExactProduct: exact });
    await searchCatalog(
      input({
        q: "Nurofen",
        type: "registry_products",
        manufacturer: "Example Pharma",
      }),
      testStore,
    );
    expect(exact).not.toHaveBeenCalled();
    expect(isExactFastPathEligible(input({ q: "Nurofen" }))).toBe(true);
    expect(isExactFastPathEligible(input({ q: "Metformin" }))).toBe(false);
    expect(isExactFastPathEligible(input({ q: "парацитамол" }))).toBe(false);
    expect(
      isExactFastPathEligible(
        input({ q: "Nurofen", mappingStatus: "approved" }),
      ),
    ).toBe(false);
  });

  it("invalidates registry caches when the snapshot version changes", () => {
    const params = input({ q: "  NUROFEN ", view: "grouped" });
    expect(registrySearchCacheKey("grouped", params, "batch-a")).not.toBe(
      registrySearchCacheKey("grouped", params, "batch-b"),
    );
    expect(registrySearchCacheKey("grouped", params, "batch-a")).toBe(
      registrySearchCacheKey(
        "grouped",
        input({ q: "nurofen", view: "grouped" }),
        "batch-a",
      ),
    );
  });

  it("does not fabricate a registry product for an ingredient-only alias", async () => {
    const result = await searchCatalog(
      input({ q: "Nurofen", type: "all" }),
      store({
        searchProducts: vi.fn(async () => ({
          catalogTotal: 16_533,
          filteredTotal: 0,
          items: [],
        })),
      }),
    );
    expect(result.ingredients[0]).toMatchObject({
      matchedName: "Nurofen",
      mappingStatus: "approved",
    });
    expect(result.registryProducts.items).toEqual([]);
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
    expect(SearchCatalogQueryParams.safeParse({ pageSize: "50" }).success).toBe(
      true,
    );
    expect(SearchCatalogQueryParams.safeParse({ page: "1.5" }).success).toBe(
      false,
    );
    expect(SearchCatalogQueryParams.safeParse({ page: "10001" }).success).toBe(
      false,
    );
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

  it("deduplicates and caches an exact PostgreSQL lookup without N+1 queries", async () => {
    resetRegistrySearchCachesForTests();
    const labels: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT COUNT(*)::int AS count")) {
        return { rows: [{ count: 16_533, snapshot_version: "batch-exact" }] };
      }
      if (sql.includes("WITH exact_candidates")) return { rows: [productRow] };
      if (sql.includes("SELECT product_registry_id, name, country")) {
        return { rows: [manufacturer] };
      }
      if (sql.includes("n.normalized") && sql.includes("ingredient_id")) {
        return { rows: [approvedMapping] };
      }
      throw new Error("Unexpected exact-path test query");
    });
    const dbStore = await createPostgresRegistryCatalogStore({
      executor: { query },
      onQuery: ({ label }) => labels.push(label),
    });
    const exactInput = input({
      q: "UA/1234/01/01",
      type: "registry_products",
      view: "grouped",
    });

    const [first, concurrent] = await Promise.all([
      dbStore.findUniqueExactProduct!(exactInput),
      dbStore.findUniqueExactProduct!(exactInput),
    ]);
    const warm = await dbStore.findUniqueExactProduct!(exactInput);

    expect(first?.items[0]?.id).toBe("registry-1");
    expect(concurrent).toEqual(first);
    expect(warm).toEqual(first);
    expect(query).toHaveBeenCalledTimes(4);
    expect(labels).toEqual(
      expect.arrayContaining([
        "catalog-snapshot",
        "registry-exact-product",
        "registry-manufacturers",
        "approved-mappings",
      ]),
    );
    const exactSql = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("WITH exact_candidates"));
    expect(exactSql).toContain("p.registration_number = $1");
    expect(exactSql).toContain("p.normalized_trade_name = $2");
    expect(exactSql).toContain("p.review_status <> 'stale'");
    expect(exactSql).toContain("TRANSLATE");
    expect(exactSql).not.toContain("query_alias");
    expect(exactSql).not.toContain("LOWER(p.inn)");
    const exactManufacturerSql = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("SELECT product_registry_id, name, country"));
    expect(exactManufacturerSql).toContain("to_jsonb(registry_manufacturer)");
    expect(exactManufacturerSql).toContain("current_status");
    resetRegistrySearchCachesForTests();
  });

  it("caches an ambiguous exact result as a bounded negative lookup", async () => {
    resetRegistrySearchCachesForTests();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT COUNT(*)::int AS count")) {
        return {
          rows: [{ count: 16_533, snapshot_version: "batch-negative" }],
        };
      }
      if (sql.includes("WITH exact_candidates")) return { rows: [] };
      throw new Error("Unexpected negative-path test query");
    });
    const dbStore = await createPostgresRegistryCatalogStore({
      executor: { query },
    });
    const exactInput = input({ q: "ambiguous", view: "grouped" });
    expect(await dbStore.findUniqueExactProduct!(exactInput)).toBeNull();
    expect(await dbStore.findUniqueExactProduct!(exactInput)).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    resetRegistrySearchCachesForTests();
  });

  it("uses the approved-alias index path for source-backed ingredient queries", async () => {
    resetRegistrySearchCachesForTests();
    const query = vi.fn(async (sql: string, _values: unknown[] = []) => {
      if (sql.includes("SELECT COUNT(*)::int AS count")) {
        return { rows: [{ count: 165, snapshot_version: "batch-test" }] };
      }
      if (sql.includes("SELECT product_registry_id, name, country")) {
        return { rows: [manufacturer] };
      }
      if (sql.includes("n.normalized") && sql.includes("ingredient_id")) {
        return { rows: [approvedMapping] };
      }
      if (sql.includes("p.registry_id")) {
        return { rows: [productRow] };
      }
      throw new Error("Unexpected test query");
    });
    const dbStore = await createPostgresRegistryCatalogStore({
      executor: { query },
    });

    const result = await dbStore.searchProducts(
      input({ q: "Ibuprofen", view: "flat" }),
    );
    expect(result.items).toHaveLength(1);

    const searchSqls = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes("exact_approved_alias"));
    expect(searchSqls).toHaveLength(2);
    for (const sql of searchSqls) {
      expect(sql).toContain(
        "JOIN (\n          SELECT DISTINCT product_alias.normalized",
      );
      expect(sql).toContain("exact_approved_alias.normalized IS NOT NULL");
      expect(sql).toContain("$1::text IS NOT NULL");
      expect(sql).toContain("cardinality($9::text[]) >= 0");
      expect(sql).not.toContain("prefix_approved_alias");
      expect(sql).not.toContain("search_manufacturer");
      expect(sql.split("ORDER BY")[0]).not.toContain(
        "LOWER(p.trade_name) LIKE",
      );
    }
  });
  it("reuses one bounded grouped snapshot without N+1 queries", async () => {
    resetRegistrySearchCachesForTests();
    const labels: string[] = [];
    const query = vi.fn(async (sql: string, _values: unknown[] = []) => {
      if (sql.includes("SELECT COUNT(*)::int AS count")) {
        return { rows: [{ count: 16_533, snapshot_version: "batch-test" }] };
      }
      if (sql.includes("SELECT product_registry_id, name, country")) {
        return { rows: [manufacturer] };
      }
      if (sql.includes("n.normalized") && sql.includes("ingredient_id")) {
        return { rows: [approvedMapping] };
      }
      if (sql.includes("p.registry_id")) {
        return { rows: [productRow] };
      }
      throw new Error("Unexpected test query");
    });
    const dbStore = await createPostgresRegistryCatalogStore({
      executor: { query },
      onQuery: ({ label }) => labels.push(label),
    });

    const first = await dbStore.searchProductsForGrouping!(
      input({ q: "Nurofen", view: "grouped" }),
    );
    expect(first.items).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(4);
    expect(labels).toHaveLength(4);
    expect(labels).toEqual(
      expect.arrayContaining([
        "catalog-snapshot",
        "registry-grouped-page",
        "registry-manufacturers",
        "approved-mappings",
      ]),
    );
    const groupedSql = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("knowledge_registry_products p"));
    expect(groupedSql).toContain("p.review_status <> 'stale'");
    expect(groupedSql).toContain("to_jsonb(search_manufacturer)");
    expect(groupedSql).toContain("query_alias.normalized = ANY($7::text[])");
    expect(groupedSql).toContain("query_alias.normalized LIKE $4");
    expect(groupedSql).not.toContain("query_alias.normalized = 2");
    expect(groupedSql).toContain(
      "ON exact_approved_alias.normalized = p.normalized_trade_name",
    );
    expect(groupedSql).toContain(
      "ON prefix_approved_alias.normalized = p.normalized_trade_name",
    );
    expect(groupedSql).not.toContain("AND product_alias.normalized IN");
    expect(groupedSql).not.toContain("catalog_keys.");
    expect(groupedSql).not.toContain("TRANSLATE(");
    expect(groupedSql).not.toContain("REGEXP_REPLACE(");
    expect(groupedSql).toContain("p.normalized_trade_name = ANY($7::text[])");
    expect(groupedSql).toContain("LOWER(p.inn) = ANY($8::text[])");
    expect(groupedSql).toContain("p.normalized_trade_name = $2");
    expect(groupedSql).toContain(
      "FROM knowledge_registry_products exact_trade",
    );
    expect(groupedSql).toContain(
      "WHERE exact_trade.normalized_trade_name = $2",
    );
    expect(groupedSql).toContain("p.normalized_trade_name LIKE $4");
    expect(groupedSql).toContain("LOWER(p.trade_name) LIKE ANY($9::text[])");
    expect(groupedSql).toContain("normalized_name");
    expect(groupedSql).toContain("LEFT JOIN LATERAL");
    expect(groupedSql).toContain("national_list_match_results");
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes("SELECT COUNT(*)::int AS count"),
      ),
    ).toHaveLength(1);

    await dbStore.searchProductsForGrouping!(
      input({
        q: "Nurofen",
        view: "grouped",
        tradeName: "Nurofen",
        variantPage: 2,
      }),
    );
    expect(query).toHaveBeenCalledTimes(7);
    const tradeFilteredCall = query.mock.calls.find(
      ([sql, values]) =>
        sql.includes("p.normalized_trade_name LIKE") &&
        values?.filter((value) => value === "%nurofen%").length === 3,
    );
    expect(tradeFilteredCall?.[0]).toContain("p.normalized_trade_name LIKE");

    await dbStore.searchProductsForGrouping!(
      input({ q: "Ibuprofen", view: "grouped", nationalListStatus: "exact" }),
    );
    expect(query).toHaveBeenCalledTimes(10);
    const filteredCall = query.mock.calls.find(
      ([sql, values]) =>
        sql.includes("national_list_match_results") &&
        values?.includes("exact"),
    );
    expect(filteredCall?.[0]).toContain("COALESCE(nlm.status");
    expect(filteredCall?.[1]).toContain("exact");
    expect(filteredCall?.[0]).not.toContain(
      "FROM knowledge_registry_products exact_trade",
    );

    await dbStore.searchProductsForGrouping!(
      input({
        q: "Amlodipine + Valsartan",
        view: "grouped",
        compositionType: "combination",
        mappingStatus: "unmapped",
      }),
    );
    expect(query).toHaveBeenCalledTimes(13);
    const preLimitFilterCall = query.mock.calls.find(
      ([sql, values]) =>
        sql.includes("COUNT(DISTINCT mapping_name.ingredient_inn_key)") &&
        values?.includes("%amlodipine%"),
    );
    expect(preLimitFilterCall?.[0]).toContain("catalog_keys.active_key");
    expect(preLimitFilterCall?.[0]).toContain("TRANSLATE(");
    expect(preLimitFilterCall?.[0]).not.toContain("REGEXP_REPLACE(");
    expect(preLimitFilterCall?.[0]).toContain("~*");
    expect(preLimitFilterCall?.[0]).toContain(
      "/[[:space:]]*([^[:space:]0-9]|$)",
    );
    expect(preLimitFilterCall?.[0]).not.toContain(
      "query_alias.normalized = ANY",
    );
    expect(preLimitFilterCall?.[0]).not.toContain(
      "catalog_keys.trade_key = ANY",
    );
    expect(preLimitFilterCall?.[0]).not.toContain(
      "LOWER(p.applicant_name) LIKE",
    );

    await dbStore.searchProductsForGrouping!(
      input({
        q: "Nurofen",
        view: "grouped",
        manufacturer: "Example Pharma",
      }),
    );
    expect(query).toHaveBeenCalledTimes(16);
    const manufacturerFilteredCall = query.mock.calls.find(([sql]) =>
      sql.includes("knowledge_registry_manufacturers filter_manufacturer"),
    );
    expect(manufacturerFilteredCall?.[0]).toContain(
      "to_jsonb(filter_manufacturer)",
    );
    expect(manufacturerFilteredCall?.[0]).toContain("current_status");
    resetRegistrySearchCachesForTests();
  });
});
