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
  SearchLoadingSkeletons,
  SEARCH_STICKY_CLASS,
  conciseDosageForm,
  conciseDosageForms,
  RegistryProductCard,
  findExactTradeNameMatches,
  isExactTradeNameQuery,
  normalizeExactTradeName,
  shouldAutoLoadExactTradeVariants,
  shouldShowPrimarySearchSpinner,
  shouldShowCatalogIndexSkeleton,
  shouldUseServerCatalogSearch,
  applyPastedQuery,
  catalogQueryDebounceMs,
  CATALOG_QUERY_DEBOUNCE_MS,
  EXACT_REGISTRATION_DEBOUNCE_MS,
  isCatalogQueryEnabled,
  mergeCatalogVariantPage,
  REGISTRY_CATALOG_SAFETY_COPY,
  resolveCatalogViewState,
  shouldDisplayCatalogResponse,
  shouldPreserveCatalogResults,
  shouldRetryCatalogRequest,
} from "./search";
import { REGISTRY_CATALOG_HREF } from "./home";
import { registryProductDetailHref } from "@/lib/registry-product-route";

vi.mock("@/components/report-issue-button", () => ({
  ReportIssueButton: () => null,
}));

describe("catalog index readiness fallback", () => {
  it("uses the debounced server fallback only until the local catalog is ready", () => {
    expect(shouldUseServerCatalogSearch("loading", false, "Enap")).toBe(true);
    expect(shouldUseServerCatalogSearch("ready", false, "Enap")).toBe(false);
    expect(shouldUseServerCatalogSearch("error", false, "Enap")).toBe(true);
    expect(shouldUseServerCatalogSearch("ready", true, "Enap")).toBe(true);
  });

  it("replaces the catalog skeleton as soon as a fallback response exists", () => {
    expect(shouldShowCatalogIndexSkeleton("loading", false)).toBe(true);
    expect(shouldShowCatalogIndexSkeleton("loading", true)).toBe(false);
    expect(shouldShowCatalogIndexSkeleton("ready", false)).toBe(false);
  });
});

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
  it("keeps rendered results visible while a valid query updates", () => {
    expect(shouldPreserveCatalogResults("Омепразол", true, true, false)).toBe(true);
    expect(shouldPreserveCatalogResults("Омепразол", true, false, true)).toBe(true);
    expect(shouldPreserveCatalogResults("Омепразол", false, true, false)).toBe(false);
    expect(shouldPreserveCatalogResults("Іб", true, true, false)).toBe(false);
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

  it("removes packaging and bulk details from displayed dosage forms", () => {
    expect(
      conciseDosageForm("таблетки in bulk; по 5000 таблеток у пакетах"),
    ).toBe("таблетки");
    expect(
      conciseDosageForm(
        "таблетки, вкриті плівковою оболонкою, по 8 таблеток у блістері",
      ),
    ).toBe("таблетки, вкриті плівковою оболонкою");
    expect(
      conciseDosageForm("капсули тверді; по 10 капсул у блістері"),
    ).toBe("капсули тверді");
    const representativeForms = [
      ["розчин для ін'єкцій, по 2 мл в ампулі", "розчин для ін'єкцій"],
      ["капсули тверді, по 10 капсул у блістері", "капсули тверді"],
      ["порошок для орального розчину, по 5 г у саше", "порошок для орального розчину"],
      ["крем для зовнішнього застосування, по 30 г у тубі", "крем для зовнішнього застосування"],
      ["мазь очна, по 5 г у тубі", "мазь очна"],
      ["супозиторії ректальні, по 5 супозиторіїв у стрипі", "супозиторії ректальні"],
      ["спрей назальний, по 10 мл у флаконі", "спрей назальний"],
      [
        "розчин оральний 20 мг/мл по 240 мл у флаконі; по 1 флакону у картонній коробці",
        "розчин оральний",
      ],
      [
        "порошок (субстанція) у подвійних поліетиленових пакетах для фармацевтичного застосування",
        "порошок (субстанція)",
      ],
      ["крем, 15 мг/1 г по 60 г у тубі", "крем"],
      ["мазь 2,5%, по 5 г у тубі", "мазь"],
      [
        "супозиторії ректальні по 150 мг; по 5 супозиторіїв у блістері",
        "супозиторії ректальні",
      ],
      [
        "спрей сублінгвальний, початковий набір: по 1 флакону у контейнері",
        "спрей сублінгвальний",
      ],
    ] as const;
    for (const [rawForm, expectedForm] of representativeForms) {
      expect(conciseDosageForm(rawForm)).toBe(expectedForm);
      expect(conciseDosageForm(expectedForm)).toBe(expectedForm);
    }
    expect(
      conciseDosageForms([
        "таблетки in bulk; по 5000 таблеток у пакетах",
        "таблетки, по 8 таблеток у блістері",
      ]),
    ).toEqual(["таблетки"]);

    const html = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: {
        ...product,
        dosageForm: "таблетки in bulk; по 5000 таблеток у пакетах",
      },
      query: "Нурофен",
      showReportIssue: false,
    }));
    expect(html).toContain("таблетки, 200 мг");
    expect(html).not.toContain("in bulk");
    expect(html).not.toContain("5000");
  });
  it("uses a mobile sticky search and compact skeletons without horizontal overflow", () => {
    expect(SEARCH_STICKY_CLASS).toContain("sticky");
    expect(SEARCH_STICKY_CLASS).toContain("top-[65px]");
    expect(SEARCH_STICKY_CLASS).toContain("md:top-0");

    const html = renderToStaticMarkup(createElement(SearchLoadingSkeletons));
    expect(html).toContain('data-testid="search-skeletons"');
    expect((html.match(/data-testid="search-skeleton-card"/g) ?? [])).toHaveLength(3);
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("max-w-full");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain("overflow-x-auto");
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
    expect(html).toContain("Є інструкція");
    expect(html).toContain(`data-testid="instruction-action-${product.id}"`);
    expect(html).toContain(`data-testid="dosage-chip-${product.id}"`);
    expect(html).toContain(`data-testid="form-badge-${product.id}"`);
    expect(html).toContain(`data-testid="product-actions-${product.id}"`);
    expect(html).toContain(`data-testid="registry-technical-details-${product.id}"`);
    expect(html).toContain(registryProductDetailHref(product));
    expect(html).toContain('href="/interactions"');
    expect(html).toContain('href="/compare"');
    expect(html).not.toContain("<details open=");
    expect(html).toContain("w-full");
    expect(html).toContain("max-w-full");
    expect(html).not.toContain("truncate");
  });

  it.each([
    {
      tradeName: "МЕТФОРМІН",
      productId: "C964B4EE30400928C2258D3A004144EB",
      registrationNumber: "UA/20900/01/01",
    },
    {
      tradeName: "ОМЕПРАЗОЛ",
      productId: "7A2C7632C5AD2BDDC2258D1D0041AB27",
      registrationNumber: "UA/17985/01/01",
    },
    {
      tradeName: "ЕЛІКВІС",
      productId: "3100C9CB2A81D315C2258CC00032ED38",
      registrationNumber: "UA/13699/01/01",
    },
  ])("routes $tradeName to the exact registry product instruction", ({
    tradeName,
    productId,
    registrationNumber,
  }) => {
    const exactProduct = {
      ...product,
      id: productId,
      tradeName,
      registration: {
        ...product.registration,
        number: registrationNumber,
      },
    };
    const html = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: exactProduct,
      query: tradeName,
      showReportIssue: false,
    }));
    expect(html).toContain(`href="/instructions/${productId}"`);
    expect(html).toContain(`data-testid="instruction-discovery-${productId}"`);
  });

  it("does not offer another product's instruction when exact binding is absent", () => {
    const html = renderToStaticMarkup(createElement(RegistryProductCard, {
      product: { ...product, instructionAvailable: false },
      query: "",
      showReportIssue: false,
    }));
    expect(html).not.toContain(`/instructions/${product.id}`);
    expect(html).not.toContain("Інструкція");
    expect(html).not.toContain("Є інструкція");
    expect(html).not.toContain("instruction-action-");
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

  it.each([
    ["Енап", "ЕНАП®", "Еналаприл", "Еналаприл-Тева"],
    ["Нурофен", "НУРОФЕН™", "Ібупрофен", "Ібупрофен-Дарниця"],
    ["Еліквіс", "ЕЛІКВІС", "Апіксабан", "Апіксабан"],
    ["Амоксиклав", "АМОКСИКЛАВ®", "Амоксицилін + клавуланова кислота", "Аугментин"],
    ["Ксарелто", "КСАРЕЛТО", "Ривароксабан", "Ривароксабан-Тева"],
  ])("prioritizes the exact %s brand and keeps related INN products collapsed", (
    query, registryTradeName, inn, relatedTradeName,
  ) => {
    const summary = {
      totalRegistryPositions: 3, uniqueTradeNames: 2, uniqueStrengths: 2,
      uniqueDosageForms: 2, uniqueManufacturers: 1, monotherapyCount: 3,
      combinationCount: 0, unknownCompositionCount: 0,
      approvedMappedCount: 3, unmappedCount: 0,
    };
    const brandProduct = {
      ...product,
      id: "exact-" + normalizeExactTradeName(query),
      tradeName: registryTradeName,
      inn,
      activeIngredient: inn,
      strength: "5 мг",
      dosageForm: "таблетки",
      manufacturers: [{ name: "KRKA", country: "Словенія" }],
    };
    const secondBrandProduct = {
      ...brandProduct,
      id: brandProduct.id + "-10",
      strength: "10 мг",
      dosageForm: "таблетки пролонгованої дії",
      registration: { ...brandProduct.registration, number: "UA/5678/01/02" },
    };
    const catalog = {
      summary,
      groups: {
        items: [{
          key: "composition-" + normalizeExactTradeName(inn),
          displayName: inn,
          officialCompositions: [inn],
          compositionType: inn.includes("+") ? "combination" : "monotherapy",
          mappingStatus: "approved",
          summary,
          source: { key: "state_registry", label: "State registry" },
          tradeNames: {
            items: [{
              key: "trade-exact-" + normalizeExactTradeName(query),
              tradeName: registryTradeName,
              normalizedTradeName: normalizeExactTradeName(registryTradeName),
              summary: { ...summary, totalRegistryPositions: 2, uniqueTradeNames: 1 },
              forms: [
                "таблетки in bulk; по 5000 таблеток у пакетах",
                "таблетки пролонгованої дії, по 8 таблеток у блістері",
              ],
              strengths: ["5 мг", "10 мг"],
              manufacturers: ["KRKA"],
              variants: {
                items: [brandProduct, secondBrandProduct],
                total: 2, page: 1, pageSize: 25, totalPages: 1, hasNext: false,
              },
            }, {
              key: "trade-related-" + normalizeExactTradeName(relatedTradeName),
              tradeName: relatedTradeName,
              normalizedTradeName: normalizeExactTradeName(relatedTradeName),
              summary: { ...summary, totalRegistryPositions: 1, uniqueTradeNames: 1 },
              forms: ["таблетки"],
              strengths: ["5 мг"],
              manufacturers: ["Інший виробник"],
              variants: null,
            }],
            total: 2, page: 1, pageSize: 10, totalPages: 1, hasNext: false,
          },
        }],
        total: 1, page: 1, pageSize: 10, totalPages: 1, hasNext: false,
      },
      appliedFilters: {
        query, tradeName: null, manufacturer: null, form: null, strength: null,
        compositionType: "all", mappingStatus: "all", nationalListStatus: "all",
        registrationStatus: null,
      },
      bounded: true,
    } as NonNullable<CatalogSearchResponse["registryGroups"]>;

    expect(isExactTradeNameQuery(query, registryTradeName)).toBe(true);
    expect(findExactTradeNameMatches(catalog, query)).toHaveLength(1);
    const html = renderToStaticMarkup(createElement(GroupedRegistryResults, {
      catalog,
      query,
      isFetching: false,
      isVariantFetching: false,
      isVariantError: false,
      selectedTradeNameKey: "trade-exact-" + normalizeExactTradeName(query),
      onRetryVariants: () => undefined,
      onSelectTrade: () => undefined,
      onGroupPage: () => undefined,
      onTradePage: () => undefined,
      onVariantPage: () => undefined,
    }));

    expect(html).toContain('data-testid="exact-brand-results"');
    expect(html).toContain("Точний збіг за торговою назвою");
    expect(html).toContain("Діюча речовина:");
    expect(html).toContain(inn);
    expect(html).toContain('data-testid="brand-strength-chips"');
    expect(html).toContain("5 мг");
    expect(html).toContain("10 мг");
    expect(html).toContain('data-testid="brand-form-badges"');
    expect(html).toContain('data-testid="product-actions-');
    expect(html).toContain('href="/interactions"');
    expect(html).toContain('href="/compare"');
    expect(html).toContain("таблетки пролонгованої дії");
    expect(html).not.toContain("in bulk");
    expect(html).not.toContain("по 5000");
    expect(html).not.toContain("по 8 таблеток");
    expect(html).toContain("KRKA");
    expect(html).toContain("Конкретні реєстрові позиції");
    expect(html).toContain('data-testid="brand-alternatives"');
    expect(html).toContain("Інші препарати з " + inn);
    expect(html.indexOf(registryTradeName)).toBeLessThan(html.indexOf(relatedTradeName));
    expect(html).toContain("/instructions/" + brandProduct.id);
    expect(html).toContain('data-testid="instruction-action-' + brandProduct.id + '"');
    expect(html).not.toContain("<details open=");
    expect(html).not.toContain("overflow-x-auto");
  });

  it("normalizes registered marks, punctuation, spacing, and case deterministically", () => {
    expect(normalizeExactTradeName("  ЕНАП®  ")).toBe("енап");
    expect(normalizeExactTradeName("Амоксиклав®/Квіктаб")).toBe(
      normalizeExactTradeName("амоксиклав квіктаб"),
    );
    expect(isExactTradeNameQuery("Нурофен", "НУРОФЕН™")).toBe(true);
    expect(isExactTradeNameQuery("Енап", "Еналаприл")).toBe(false);
  });
  it("does not refetch embedded exact variants or keep the primary spinner active", () => {
    expect(shouldAutoLoadExactTradeVariants(true, null)).toBe(false);
    expect(shouldAutoLoadExactTradeVariants(false, null)).toBe(true);
    expect(shouldAutoLoadExactTradeVariants(false, "trade-selected")).toBe(false);
    expect(shouldShowPrimarySearchSpinner(false, false, true)).toBe(false);
    expect(shouldShowPrimarySearchSpinner(false, true, false)).toBe(true);
    expect(shouldShowPrimarySearchSpinner(true, false, false)).toBe(true);
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

    const expandedHtml = renderToStaticMarkup(createElement(GroupedRegistryResults, {
      catalog: variantCatalog,
      query: "Amlodipine",
      isFetching: false,
      isVariantFetching: false,
      isVariantError: false,
      selectedTradeNameKey: trade.key,
      onRetryVariants: () => undefined,
      onSelectTrade: () => undefined,
      onGroupPage: () => undefined,
      onTradePage: () => undefined,
      onVariantPage: () => undefined,
    }));
    expect(expandedHtml).toContain('data-testid="instruction-badge-trade-trade-amlodipine-pharma"');
    expect(expandedHtml).toContain(`data-testid="instruction-action-${product.id}"`);
    expect(expandedHtml).toContain(`/instructions/${product.id}`);
    expect(expandedHtml).toContain("Є інструкція");
    expect(expandedHtml).toContain("min-w-0");
    expect(expandedHtml).not.toContain("overflow-x-auto");

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
