import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogSearchResponse, RegistryProductResult } from "@workspace/api-client-react";
import {
  GroupedRegistryResults,
  RegistryProductCard,
  mergeCatalogVariantPage,
  REGISTRY_CATALOG_SAFETY_COPY,
  resolveCatalogViewState,
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
};

describe("registry catalog UI", () => {
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
    expect(html).not.toContain("truncate");
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
