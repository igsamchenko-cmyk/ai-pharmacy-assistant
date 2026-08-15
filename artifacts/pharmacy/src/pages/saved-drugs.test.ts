import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import type { RegistryProductResult } from "@workspace/api-client-react";
import { SavedList } from "./history";
import {
  RegistryProductDetailContent,
  registryProductDrugRef,
} from "./registry-product-detail";
import type { DrugRef } from "@/hooks/use-favorites";

const representative = [
  ["ЕНАП", "Еналаприл", "10 мг", "UA/10001/01/01", "A"],
  ["НУРОФЕН", "Ібупрофен", "200 мг", "UA/10002/01/01", "B"],
  ["ЕЛІКВІС", "Апіксабан", "5 мг", "UA/13699/01/01", "C"],
  [
    "АМОКСИКЛАВ",
    "Амоксицилін + клавуланова кислота",
    "875 мг/125 мг",
    "UA/10004/01/01",
    "D",
  ],
  ["КСАРЕЛТО", "Ривароксабан", "20 мг", "UA/10005/01/01", "E"],
] as const;

function registryProduct(
  item: (typeof representative)[number],
): RegistryProductResult {
  const [tradeName, inn, strength, registration, hex] = item;
  return {
    id: hex.repeat(32),
    tradeName,
    inn,
    activeIngredient: inn,
    dosageForm: "таблетки, вкриті плівковою оболонкою, по 20 таблеток",
    strength,
    manufacturers: [{ name: "Офіційний виробник", country: "Україна" }],
    registration: {
      number: registration,
      status: "active",
      startDate: "2025-01-01",
      endDate: "2030-01-01",
    },
    instructionAvailable: true,
    resultType: "registry_product",
    atcCode: "",
    source: { key: "drlz", label: "ДРЛЗ" },
    mappingStatus: "approved",
    approvedMapping: null,
    sourceRecordCount: 1,
    nationalListStatus: "not_applicable",
    nationalListRelease: null,
    nationalListMatchReason: "",
    nationalListSection: null,
    nationalListSource: null,
    nationalListCheckedAt: null,
    nationalListMatchDetails: null,
  };
}

const storedProducts: DrugRef[] = representative.map((item) =>
  registryProductDrugRef(registryProduct(item)),
);

function renderWithRouter(element: React.ReactElement): string {
  return renderToStaticMarkup(createElement(Router, { ssrPath: "/" }, element));
}

describe("favorites and viewing-history mobile UI", () => {
  it("creates complete local card metadata and exact routes for five brands", () => {
    for (const [index, item] of representative.entries()) {
      const product = registryProduct(item);
      const ref = storedProducts[index]!;
      expect(ref).toMatchObject({
        id: product.id,
        brandName: item[0],
        inn: item[1],
        dosage: item[2],
        form: "таблетки, вкриті плівковою оболонкою",
        manufacturer: "Офіційний виробник, Україна",
        registration: item[3],
      });
      expect(ref.form).not.toContain("по 20 таблеток");
      expect(ref.href).toBe(
        "/products/" +
          product.id +
          "?registration=" +
          encodeURIComponent(item[3]),
      );
    }
  });

  it("renders complete favorite cards without horizontal overflow", () => {
    const html = renderWithRouter(
      createElement(SavedList, {
        items: storedProducts,
        emptyTab: "favorites",
        onRemove: () => undefined,
      }),
    );

    for (const drug of storedProducts) {
      expect(html).toContain(drug.brandName);
      expect(html).toContain(drug.dosage);
      expect(html).toContain(drug.form);
      expect(html).toContain(drug.manufacturer);
      expect(html).toContain(drug.registration);
      expect(html).toContain(
        'href="' + drug.href?.replaceAll("&", "&amp;") + '"',
      );
    }
    expect(html).toContain("Прибрати з обраного");
  });

  it("renders the latest-viewed list and both empty states", () => {
    const history = renderWithRouter(
      createElement(SavedList, {
        items: storedProducts,
        emptyTab: "history",
        onRemove: () => undefined,
      }),
    );
    expect(history).toContain("Прибрати з історії");

    const emptyFavorites = renderWithRouter(
      createElement(SavedList, {
        items: [],
        emptyTab: "favorites",
        onRemove: () => undefined,
      }),
    );
    const emptyHistory = renderWithRouter(
      createElement(SavedList, {
        items: [],
        emptyTab: "history",
        onRemove: () => undefined,
      }),
    );
    expect(emptyFavorites).toContain("Обране поки порожнє");
    expect(emptyHistory).toContain("Історія поки порожня");
  });

  it("keeps the product detail favorite action wired for every representative", () => {
    for (const item of representative) {
      const html = renderToStaticMarkup(
        createElement(RegistryProductDetailContent, {
          product: registryProduct(item),
          favorite: false,
          onToggleFavorite: () => undefined,
        }),
      );
      expect(html).toContain('data-testid="detail-favorite-action"');
      expect(html).toContain("В обране");
    }
  });
});
