import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getSearchCatalogQueryOptions,
  type CatalogSearchResponse,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import { QueryClient } from "@tanstack/react-query";
import {
  GroupedRegistryResults,
  RegistryProductCard,
  applyPastedQuery,
  catalogQueryDebounceMs,
  CATALOG_QUERY_DEBOUNCE_MS,
  EXACT_REGISTRATION_DEBOUNCE_MS,
  isCatalogQueryEnabled,
  mergeCatalogVariantPage,
  REGISTRY_CATALOG_SAFETY_COPY,
  resolveCatalogViewState,
  shouldDisplayCatalogResponse,
  shouldRetryCatalogRequest,
} from "./search";
import { REGISTRY_CATALOG_HREF } from "./home";

const product: RegistryProductResult = {
  resultType: "registry_product",
  id: "registry-1",
  tradeName: "Нурофен",
  inn: "Ібупрофен",
  activeIngredient: "Ібупрофен 200 мг",
  atcCode: "M01AE01",
  dosageForm: "таблетки, вкриті оболонкою",
  strength: "200 мг",
  manufacturers: [{ name: "Reckitt", country: "United Kingdom" }],
  registration: {
    number: "UA/1234/01/01",
    startDate: "2024-01-01",
    endDate: "2029-01-01",
    status: "active",
  },
  source: {
    key: "state_registry",
    label: "State Register of Medicines of Ukraine",
  },
  mappingStatus: "approved",
  sourceRecordCount: 1,
  approvedMapping: {
    ingredientId: "ingredient-1",
    inn: "Ібупрофен",
    latin: "Ibuprofenum",
    english: "Ibuprofen",
    atcCode: "M01AE01",
  },
  nationalListStatus: "exact",
  nationalListRelease: "ua-national-list-2025-10-10",
  nationalListMatchReason: "INN, form, route and strength match.",
  nationalListSection: "II. Pain and palliative care",
  nationalListSource: {
    title: "National Medicines List",
    actNumber: "333",
    actDate: "2009-03-25",
    revisionDate: "2025-10-10",
    effectiveDate: "2025-10-10",
    url: "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF#Text",
  },
  nationalListCheckedAt: "2026-07-13T00:00:00.000Z",
  nationalListMatchDetails: {
    officialName: "Ібупрофен",
    ingredients: ["Ibuprofen"],
    dosageForms: ["таблетки"],
    routes: ["oral"],
    strengths: ["200 мг"],
    ingredientMatch: "match",
    formMatch: "match",
    routeMatch: "match",
    strengthMatch: "match",
  },
  instructionAvailable: true,
};

describe("registry catalog UI", () => {
  it("uses adaptive search timing without querying one or two characters", () => {
    expect(catalogQueryDebounceMs("Метформін")).toBe(CATALOG_QUERY_DEBOUNCE_MS);
    expect(catalogQueryDebounceMs("UA/1234/01/01")).toBe(
      EXACT_REGISTRATION_DEBOUNCE_MS,
    );
    expect(isCatalogQueryEnabled("")).toBe(true);
    expect(isCatalogQueryEnabled("Іб")).toBe(false);
    expect(isCatalogQueryEnabled("Ібу")).toBe(true);
  });

  it("builds the pasted query synchronously for an immediate request", () => {
    expect(applyPastedQuery("UA//01", 3, 3, "1234/01")).toBe(
      "UA/1234/01/01",
    );
    expect(applyPastedQuery("Метформін", 0, 9, "Омепразол")).toBe("Омепразол");
  });

  it("hides placeholder and stale responses while the query changes", () => {
    expect(shouldDisplayCatalogResponse("Метформін", "Метформін", false)).toBe(true);
    expect(shouldDisplayCatalogResponse("Омепразол", "Метформін", false)).toBe(false);
    expect(shouldDisplayCatalogResponse("Метформін", "Метформін", true)).toBe(false);
    expect(shouldDisplayCatalogResponse("Іб", "Іб", false)).toBe(false);
  });

  it("forwards cancellation and deduplicates identical in-flight requests", async () => {
    const response = {
      query: "Метформін",
      type: "registry_products",
      view: "grouped",
      runtimeMode: "db",
      catalogTotal: 16_533,
      ingredients: [],
      registryProducts: {
        items: [], total: 0, page: 1, pageSize: 25, totalPages: 0, hasNext: false,
      },
      registryGroups: null,
      warnings: [],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const params = {
      q: "Метформін",
      type: "registry_products" as const,
      view: "grouped" as const,
    };
    const options = getSearchCatalogQueryOptions(params);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 120_000 } },
    });

    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    });
    fetchSpy.mockRestore();
    client.clear();
  });

  it("renders a mobile-safe registry card with production fields", () => {
    const html = renderToStaticMarkup(
      createElement(RegistryProductCard, { product, query: "Нурофен", showReportIssue: false }),
    );
    expect(html).toContain("Нурофен");
    expect(html).toContain("Ібупрофен");
    expect(html).toContain("200 мг");
    expect(html).toContain("таблетки, вкриті оболонкою");
    expect(html).toContain("Reckitt");
    expect(html).toContain("UA/1234/01/01");
    expect(html).toContain("Державний реєстр");
    expect(html).toContain("Підтверджено");
    expect(html).toContain("break-words");
    expect(html).toContain("overflow-hidden");
    expect(html).toContain("Нацперелік");
    expect(html).toContain('data-testid="national-list-exact"');
    expect(html).toContain(`/instructions/${product.id}`);
    expect(html).toContain("Інструкція");
    expect(html).not.toContain("truncate");
  });

  it("does not offer another product's instruction when exact binding is absent", () => {
    const html = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: { ...product, instructionAvailable: false },
      query: "",
      showReportIssue: false,
    }));
    expect(html).not.toContain(`/instructions/${product.id}`);
    expect(html).not.toContain("Інструкція");
  });

  it("shows the National List badge only for exact matches", () => {
    const ingredientOnly = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: { ...product, nationalListStatus: "ingredient_only" },
      query: "",
      showReportIssue: false,
    }));
    expect(ingredientOnly).toContain("МНН у Нацпереліку");
    expect(ingredientOnly).not.toContain('data-testid="national-list-exact"');
    const uncertain = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: { ...product, nationalListStatus: "uncertain" },
      query: "",
      showReportIssue: false,
    }));
    expect(uncertain).toContain("Потребує уточнення");
    expect(uncertain).not.toContain('data-testid="national-list-exact"');
    const unavailable = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: {
        ...product,
        nationalListStatus: "not_applicable",
        nationalListRelease: null,
        nationalListSource: null,
        nationalListMatchDetails: null,
      },
      query: "",
      showReportIssue: false,
    }));
    expect(unavailable).not.toContain('data-testid="national-list-exact"');
    expect(unavailable).not.toContain('data-testid="national-list-details"');
  });

  it("clearly labels a product without an approved mapping", () => {
    const html = renderToStaticMarkup(
      createElement(RegistryProductCard, {
        product: { ...product, mappingStatus: "unmapped", approvedMapping: null },
        query: "",
        showReportIssue: false,
      }),
    );
    expect(html).toContain("mapping не підтверджений");
    expect(html).toContain("Підтвердженого mapping немає");
    expect(html).not.toContain("Внутрішній ingredient mapping</p>");
  });

  it("keeps secrets and filesystem paths out of visible product markup", () => {
    const html = renderToStaticMarkup(
      createElement(RegistryProductCard, {
        product: {
          ...product,
          source: {
            key: "postgresql://token@host/C:/private",
            label: "unsafe",
          },
        },
        query: "",
        showReportIssue: false,
      }),
    );
    expect(html).not.toContain("postgresql://");
    expect(html).not.toContain("C:/private");
    expect(html).not.toContain("DATABASE_URL");
  });

  it("renders composition and trade-name hierarchy before variants", () => {
    const catalog: NonNullable<CatalogSearchResponse["registryGroups"]> = {
      summary: {
        totalRegistryPositions: 302,
        uniqueTradeNames: 18,
        uniqueStrengths: 6,
        uniqueDosageForms: 3,
        uniqueManufacturers: 12,
        monotherapyCount: 280,
        combinationCount: 22,
        unknownCompositionCount: 0,
        approvedMappedCount: 120,
        unmappedCount: 182,
      },
      groups: {
        items: [{
          key: "composition-amlodipine",
          displayName: "Amlodipine",
          officialCompositions: ["Amlodipine"],
          compositionType: "monotherapy",
          mappingStatus: "mixed",
          summary: {
            totalRegistryPositions: 302,
            uniqueTradeNames: 18,
            uniqueStrengths: 6,
            uniqueDosageForms: 3,
            uniqueManufacturers: 12,
            monotherapyCount: 302,
            combinationCount: 0,
            unknownCompositionCount: 0,
            approvedMappedCount: 120,
            unmappedCount: 182,
          },
          source: { key: "state_registry", label: "State registry" },
          tradeNames: {
            items: [{
              key: "trade-amlodipine-pharma",
              tradeName: "Amlodipine Pharma",
              normalizedTradeName: "amlodipine pharma",
              summary: {
                totalRegistryPositions: 24,
                uniqueTradeNames: 1,
                uniqueStrengths: 2,
                uniqueDosageForms: 1,
                uniqueManufacturers: 2,
                monotherapyCount: 24,
                combinationCount: 0,
                unknownCompositionCount: 0,
                approvedMappedCount: 12,
                unmappedCount: 12,
              },
              forms: ["tablets"],
              strengths: ["5 mg", "10 mg"],
              manufacturers: ["Example Pharma"],
              variants: null,
            }],
            total: 1,
            page: 1,
            pageSize: 10,
            totalPages: 1,
            hasNext: false,
          },
        }],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasNext: false,
      },
      appliedFilters: {
        query: "Amlodipine",
        tradeName: null,
        manufacturer: null,
        form: null,
        strength: null,
        compositionType: "all",
        mappingStatus: "all",
        nationalListStatus: "all",
        registrationStatus: null,
      },
      bounded: true,
    };
    const html = renderToStaticMarkup(createElement(GroupedRegistryResults, {
      catalog,
      query: "Amlodipine",
      isFetching: false,
      onSelectTrade: () => undefined,
      onGroupPage: () => undefined,
      onTradePage: () => undefined,
      onVariantPage: () => undefined,
    }));

    expect(html).toContain('data-testid="grouped-registry-results"');
    expect(html).toContain("302");
    expect(html).toContain("Amlodipine");
    expect(html).toContain("Amlodipine Pharma");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).not.toContain("postgresql://");

    const group = catalog.groups.items[0];
    const trade = group.tradeNames.items[0];
    const variantCatalog: typeof catalog = {
      ...catalog,
      groups: {
        ...catalog.groups,
        items: [{
          ...group,
          tradeNames: {
            ...group.tradeNames,
            items: [{
              ...trade,
              variants: {
                items: [product],
                total: 1,
                page: 1,
                pageSize: 10,
                totalPages: 1,
                hasNext: false,
              },
            }],
          },
        }],
      },
    };
    const merged = mergeCatalogVariantPage(
      catalog,
      variantCatalog,
      group.key,
      trade.key,
    );
    expect(catalog.groups.items[0].tradeNames.items[0].variants).toBeNull();
    expect(
      merged?.groups.items[0].tradeNames.items[0].variants?.items,
    ).toEqual([product]);

    const loadingHtml = renderToStaticMarkup(createElement(GroupedRegistryResults, {
      catalog,
      query: "Amlodipine",
      isFetching: true,
      isVariantFetching: true,
      isVariantError: false,
      selectedTradeNameKey: trade.key,
      onRetryVariants: () => undefined,
      onSelectTrade: () => undefined,
      onGroupPage: () => undefined,
      onTradePage: () => undefined,
      onVariantPage: () => undefined,
    }));
    expect(loadingHtml).toContain('data-testid="variant-loading"');
    expect(loadingHtml).not.toContain('data-testid="registry-product-registry-1"');
  });

  it("retries one network or server failure but never retries client errors", () => {
    expect(shouldRetryCatalogRequest(0, new TypeError("network"))).toBe(true);
    expect(shouldRetryCatalogRequest(1, new TypeError("network"))).toBe(false);
    expect(shouldRetryCatalogRequest(0, { status: 503 })).toBe(true);
    expect(shouldRetryCatalogRequest(0, { status: 401 })).toBe(false);
  });

  it("has deterministic loading, error, empty, and results states", () => {
    expect(resolveCatalogViewState(true, false, false)).toBe("loading");
    expect(resolveCatalogViewState(false, true, false)).toBe("error");
    expect(resolveCatalogViewState(false, false, false)).toBe("empty");
    expect(resolveCatalogViewState(false, false, true)).toBe("results");
  });

  it("preserves the medical warning and the full-catalog home route", () => {
    expect(REGISTRY_CATALOG_SAFETY_COPY).toBe(
      "Наявність препарату в реєстрі не підтверджує взаємозамінність, відсутність взаємодій або доцільність застосування.",
    );
    expect(REGISTRY_CATALOG_HREF).toBe("/search?type=registry_products");
  });
});
