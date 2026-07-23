import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RegistryProductResult } from "@workspace/api-client-react";
import {
  REGISTRY_PRODUCT_TOP_BAR_CLASS,
  RegistryProductDetailContent,
  RegistryProductDetailSkeleton,
  registryProductDetailSearchParams,
} from "./registry-product-detail";
import {
  registrationFromSearch,
  registryProductDetailHref,
} from "@/lib/registry-product-route";
import { drugRefHref } from "@/hooks/use-favorites";

const representativeProducts = [
  {
    tradeName: "ЕНАП",
    inn: "еналаприл",
    id: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    registration: "UA/10001/01/01",
    strength: "10 мг",
    form: "таблетки, по 20 таблеток у блістері",
  },
  {
    tradeName: "НУРОФЕН",
    inn: "ібупрофен",
    id: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    registration: "UA/10002/01/01",
    strength: "200 мг",
    form: "таблетки, вкриті оболонкою; по 12 таблеток",
  },
  {
    tradeName: "ЕЛІКВІС",
    inn: "апіксабан",
    id: "3100C9CB2A81D315C2258CC00032ED38",
    registration: "UA/13699/01/01",
    strength: "5 мг",
    form: "таблетки, вкриті плівковою оболонкою, по 20 таблеток",
  },
  {
    tradeName: "АМОКСИКЛАВ",
    inn: "амоксицилін + клавуланова кислота",
    id: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    registration: "UA/10004/01/01",
    strength: "875 мг/125 мг",
    form: "таблетки, вкриті оболонкою, по 14 таблеток",
  },
  {
    tradeName: "КСАРЕЛТО",
    inn: "ривароксабан",
    id: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    registration: "UA/10005/01/01",
    strength: "20 мг",
    form: "таблетки, вкриті плівковою оболонкою, по 28 таблеток",
  },
] as const;

function productFixture(
  item: (typeof representativeProducts)[number],
  overrides: Partial<RegistryProductResult> = {},
): RegistryProductResult {
  return {
    resultType: "registry_product",
    id: item.id,
    tradeName: item.tradeName,
    inn: item.inn,
    activeIngredient: item.inn,
    atcCode: "C09AA02",
    dosageForm: item.form,
    strength: item.strength,
    manufacturers: [{ name: "Офіційний виробник", country: "Україна" }],
    registration: {
      number: item.registration,
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      status: "active",
    },
    source: { key: "drlz", label: "Державний реєстр лікарських засобів" },
    mappingStatus: "approved",
    approvedMapping: {
      ingredientId: "ingredient-1",
      inn: item.inn,
      latin: item.inn,
      english: item.inn,
      atcCode: "C09AA02",
    },
    sourceRecordCount: 1,
    nationalListStatus: "exact",
    nationalListRelease: "ua-national-list-2025-10-10",
    nationalListMatchReason: "Точний збіг з офіційним Національним переліком.",
    nationalListSection: "Основні лікарські засоби",
    nationalListSource: {
      title: "Національний перелік",
      actNumber: "333",
      actDate: "2009-03-25",
      revisionDate: "2025-10-10",
      effectiveDate: "2025-10-10",
      url: "https://zakon.rada.gov.ua/",
    },
    nationalListCheckedAt: "2026-07-18T00:00:00.000Z",
    nationalListMatchDetails: {
      officialName: item.inn,
      ingredients: [item.inn],
      dosageForms: ["таблетки"],
      routes: ["перорально"],
      strengths: [item.strength],
      ingredientMatch: "match",
      formMatch: "match",
      routeMatch: "match",
      strengthMatch: "match",
    },
    instructionAvailable: true,
    ...overrides,
  };
}

describe("registry product mobile detail UI", () => {
  it("uses the exact-registration fast path for product detail requests", () => {
    expect(
      registryProductDetailSearchParams(
        "FD14BF34ACB8E705C2258BCB00314A4A",
        "UA/10299/01/01",
      ),
    ).toEqual({
      q: "UA/10299/01/01",
      productId: "FD14BF34ACB8E705C2258BCB00314A4A",
      type: "registry_products",
      view: "grouped",
      page: 1,
      pageSize: 25,
    });
  });
  it.each(representativeProducts)(
    "renders $tradeName as a compact, actionable registry product page",
    (item) => {
      const product = productFixture(item);
      const html = renderToStaticMarkup(
        createElement(RegistryProductDetailContent, {
          product,
          favorite: false,
          onToggleFavorite: () => undefined,
        }),
      );

      expect(html).toContain(item.tradeName);
      expect(html).toContain(item.inn);
      expect(html).toContain(item.registration);
      expect(html).toContain(item.strength);
      expect(html).toContain("таблетки");
      expect(html).not.toContain("по 20 таблеток");
      expect(html).not.toContain("по 28 таблеток");
      expect(html).toContain("Реєстр");
      expect(html).toContain("У Нацпереліку");
      expect(html).toContain("Є інструкція");
      expect(html).toContain(`href="/instructions/${item.id}"`);
      expect(html).toContain('href="/interactions"');
      expect(html).toContain('href="/compare"');
      expect(html).toContain("В обране");
      expect(html).toContain('data-testid="registry-technical-details"');
      expect(html).not.toContain("<details open=");
      expect(html).toContain("motion-reduce:animate-none");
      expect(html).toContain("max-w-full");
      expect(html).not.toContain("overflow-x-auto");
    },
  );

  it.each([
    ["exact", "У Нацпереліку"],
    ["ingredient_only", "Не у Нацпереліку як конкретна реєстрова позиція"],
    ["uncertain", "Статус Нацпереліку не визначено"],
    ["not_listed", "Не у Нацпереліку"],
    ["not_applicable", "Не визначено — активний Нацперелік недоступний"],
  ] as const)(
    "shows an explicit per-position National List verdict for %s",
    (nationalListStatus, expectedVerdict) => {
      const product = productFixture(representativeProducts[0], {
        nationalListStatus,
        nationalListMatchReason:
          "No matching INN or fixed combination exists in the active release.",
        nationalListRelease:
          nationalListStatus === "not_applicable"
            ? null
            : "ua-national-list-2025-10-10",
        nationalListSource:
          nationalListStatus === "not_applicable" ? null : undefined,
        nationalListMatchDetails:
          nationalListStatus === "not_applicable" ? null : undefined,
      });
      const html = renderToStaticMarkup(
        createElement(RegistryProductDetailContent, {
          product,
          favorite: false,
          onToggleFavorite: () => undefined,
        }),
      );

      expect(html).toContain('data-testid="national-list-badge"');
      expect(html).toContain('data-testid="national-list-details"');
      expect(html).toContain('data-testid="national-list-verdict"');
      expect(html).toContain(expectedVerdict);
      expect(html).toContain(product.registration.number);
      expect(html).not.toContain(
        "No matching INN or fixed combination exists in the active release.",
      );
    },
  );

  it("shows concise official manufacturer names without production roles", () => {
    const product = productFixture(representativeProducts[0], {
      manufacturers: [
        {
          name: 'АТ "Лубнифарм" (відповідальний за виробництво, первинне, вторинне пакування, контроль якості)',
          country: "Україна",
        },
        {
          name: 'ПрАТ "ФІТОФАРМ" (відповідальний за пакування, контроль та випуск серій)',
          country: "Україна",
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(RegistryProductDetailContent, { product }),
    );

    expect(html).toContain("Виробники");
    expect(html).toContain('АТ &quot;Лубнифарм&quot;, Україна');
    expect(html).toContain('ПрАТ &quot;ФІТОФАРМ&quot;, Україна');
    expect(html).not.toMatch(/первинне|пакування|контроль|випуск серій/iu);
  });

  it("renders a reduced-motion skeleton without horizontal overflow", () => {
    const html = renderToStaticMarkup(
      createElement(RegistryProductDetailSkeleton),
    );
    expect(html).toContain('data-testid="registry-product-detail-skeleton"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("overflow-x-hidden");
    expect(html).not.toContain("overflow-x-auto");
    expect(REGISTRY_PRODUCT_TOP_BAR_CLASS).toContain("top-[65px]");
    expect(REGISTRY_PRODUCT_TOP_BAR_CLASS).toContain("md:top-0");
  });

  it("never creates an instruction route for an unavailable leaflet", () => {
    const product = productFixture(representativeProducts[0], {
      instructionAvailable: false,
    });
    const html = renderToStaticMarkup(
      createElement(RegistryProductDetailContent, {
        product,
        favorite: false,
        onToggleFavorite: () => undefined,
      }),
    );
    expect(html).not.toContain(`/instructions/${product.id}`);
    expect(html).toContain('data-testid="detail-instruction-unavailable"');
  });

  it("builds and validates the exact product route without trusting malformed input", () => {
    const product = productFixture(representativeProducts[2]);
    const href = registryProductDetailHref(product);
    expect(href).toBe(
      `/products/${product.id}?registration=UA%2F13699%2F01%2F01`,
    );
    expect(registrationFromSearch("?registration=UA%2F13699%2F01%2F01")).toBe(
      "UA/13699/01/01",
    );
    expect(registrationFromSearch("?registration=../../secret")).toBe("");
    expect(
      drugRefHref({
        id: product.id,
        brandName: product.tradeName,
        inn: product.inn,
        href,
      }),
    ).toBe(href);
    expect(drugRefHref({ id: "legacy", brandName: "Legacy", inn: "inn" })).toBe(
      "/drug/legacy",
    );
  });
});
