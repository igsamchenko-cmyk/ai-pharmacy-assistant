import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RegistryProductResult } from "@workspace/api-client-react";
import {
  RegistryProductCard,
  REGISTRY_CATALOG_SAFETY_COPY,
  resolveCatalogViewState,
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
