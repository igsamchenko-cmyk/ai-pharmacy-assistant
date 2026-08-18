import { describe, expect, it } from "vitest";
import {
  CATALOG_CLIENT_INDEX_VERSION,
  catalogPositionsByIdentity,
  catalogProductById,
  compileCatalogClientIndex,
  encodeCatalogClientIndexRow,
  normalizeCatalogIndexText,
  searchCatalogClientIndex,
  type CatalogClientIndexPayload,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";

function id(value: number): string {
  return value.toString(16).toUpperCase().padStart(32, "0");
}

function product(
  value: number,
  tradeName: string,
  inn: string,
  compositionKey = "",
): CatalogClientIndexProduct {
  return {
    productId: id(value),
    registration: `UA/${value}/01/01`,
    tradeName,
    inn,
    form: "таблетки",
    strength: "10 мг",
    compositionKey,
    manufacturer: "Виробник",
    registrationValidity: "2030-01-01",
  };
}

function compile(products: CatalogClientIndexProduct[]) {
  const payload: CatalogClientIndexPayload = {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: "a".repeat(64),
    generatedAt: "2026-07-19T00:00:00.000Z",
    productCount: products.length,
    aliasCount: 0,
    rows: products.map(encodeCatalogClientIndexRow),
    aliases: [],
  };
  return compileCatalogClientIndex(payload);
}

describe("catalogProductById", () => {
  it("returns the exact row and nothing for an unknown id", () => {
    const index = compile([
      product(1, "ЕНАП®", "Enalapril"),
      product(2, "ЕЛІКВІС®", "Apixaban"),
    ]);
    expect(catalogProductById(index, id(2))?.tradeName).toBe("ЕЛІКВІС®");
    expect(catalogProductById(index, id(99))).toBeNull();
  });
});

describe("catalogPositionsByIdentity", () => {
  it("returns a whole group regardless of size", () => {
    // The ranked search this replaced capped analog candidates at 250, so a
    // large group came back silently short.
    const index = compile(
      Array.from({ length: 300 }, (_, offset) =>
        product(offset + 1, `БРЕНД ${offset}`, "Ibuprofen"),
      ),
    );
    const group = catalogPositionsByIdentity(index, {
      innKey: normalizeCatalogIndexText("Ibuprofen"),
    });
    expect(group).toHaveLength(300);
    // The old path would have had to rank all 300 to return any of them.
    expect(
      searchCatalogClientIndex(index, "Ibuprofen", { scope: "ingredients" })
        .items.length,
    ).toBeLessThan(300);
  });

  it("prefers composition, which is only ever set where the МНН is unusable", () => {
    const index = compile([
      product(1, "РЕННІ", "Comb drug", "кальціюкарбонат;магніюкарбонат"),
      product(2, "РЕММАКС", "Comb drug", "кальціюкарбонат;магніюкарбонат"),
      product(3, "ІНШЕ", "Comb drug", "інший;склад"),
    ]);
    const byComposition = catalogPositionsByIdentity(index, {
      compositionKey: "кальціюкарбонат;магніюкарбонат",
      innKey: normalizeCatalogIndexText("Comb drug"),
    });
    expect(byComposition.map((entry) => entry.tradeName)).toEqual([
      "РЕННІ",
      "РЕММАКС",
    ]);
  });

  it("treats an unknown identity as nothing, never as everything", () => {
    // Returning the catalog for an empty key would present every medicine on
    // the register as an analog of the one on screen.
    const index = compile([product(1, "ЕНАП®", "Enalapril")]);
    expect(catalogPositionsByIdentity(index, {})).toEqual([]);
    expect(catalogPositionsByIdentity(index, { innKey: "" })).toEqual([]);
    expect(catalogPositionsByIdentity(index, { compositionKey: "" })).toEqual(
      [],
    );
    expect(
      catalogPositionsByIdentity(index, { innKey: "невідомамнн" }),
    ).toEqual([]);
  });

  it("hands back a copy so a caller cannot corrupt the cached group", () => {
    const index = compile([
      product(1, "ЕНАП®", "Enalapril"),
      product(2, "ЕНАЛАПРИЛ", "Enalapril"),
    ]);
    const innKey = normalizeCatalogIndexText("Enalapril");
    catalogPositionsByIdentity(index, { innKey }).pop();
    expect(catalogPositionsByIdentity(index, { innKey })).toHaveLength(2);
  });
});
