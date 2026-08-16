import { describe, expect, it } from "vitest";
import {
  CATALOG_SECTION_INTENT_DICTIONARY,
  extractCatalogSectionIntent,
  type CatalogSectionIntentKey,
} from "@workspace/catalog-index";

describe("extractCatalogSectionIntent", () => {
  it("strips a trailing section keyword and reports its key", () => {
    expect(extractCatalogSectionIntent("амоксил лактація")).toEqual({
      query: "амоксил",
      sectionIntent: "pregnancyAndLactation",
    });
  });

  it("strips a leading section keyword and reports its key", () => {
    expect(extractCatalogSectionIntent("показання нурофен")).toEqual({
      query: "нурофен",
      sectionIntent: "indications",
    });
  });

  it("matches inflected forms via the token prefix, not just the example word", () => {
    expect(extractCatalogSectionIntent("парацетамол дозування")).toEqual({
      query: "парацетамол",
      sectionIntent: "administration",
    });
    expect(extractCatalogSectionIntent("парацетамол дозах")).toEqual({
      query: "парацетамол",
      sectionIntent: "administration",
    });
  });

  it("recognizes every dictionary group with at least one product-name query", () => {
    const samples: Record<CatalogSectionIntentKey, string> = {
      indications: "нурофен показання",
      administration: "нурофен дозування",
      pregnancyAndLactation: "нурофен лактація",
      contraindications: "нурофен протипоказання",
      adverseReactions: "нурофен побічні",
      interactions: "нурофен взаємодія",
      storage: "нурофен зберігання",
      overdose: "нурофен передозування",
    };
    for (const [sectionKey, query] of Object.entries(samples)) {
      expect(extractCatalogSectionIntent(query).sectionIntent).toBe(
        sectionKey,
      );
    }
    expect(Object.keys(samples)).toHaveLength(
      CATALOG_SECTION_INTENT_DICTIONARY.length,
    );
  });

  it("does not extract an intent when the query is only the section keyword (no product name to land on)", () => {
    expect(extractCatalogSectionIntent("показання")).toEqual({
      query: "показання",
    });
    expect(extractCatalogSectionIntent("лактація годування")).toEqual({
      query: "лактація годування",
    });
  });

  it("leaves single-token queries completely untouched, even if the token happens to match a prefix", () => {
    // A hypothetical single-word product/brand query must never be mutated:
    // there is nothing to split it into "name" + "section keyword".
    expect(extractCatalogSectionIntent("дозиметрин")).toEqual({
      query: "дозиметрин",
    });
  });

  it("leaves queries with no section keyword completely untouched", () => {
    expect(extractCatalogSectionIntent("нурофен форте")).toEqual({
      query: "нурофен форте",
    });
    expect(extractCatalogSectionIntent("")).toEqual({ query: "" });
  });

  it("does not extract an intent for children/'Діти' keywords -- there is no matching section in the 9-key model", () => {
    expect(extractCatalogSectionIntent("німесил дітям")).toEqual({
      query: "німесил дітям",
    });
  });

  it("collapses to the same remainder regardless of keyword position, matching plain-query whitespace normalization", () => {
    expect(extractCatalogSectionIntent("нурофен показання").query).toBe(
      "нурофен",
    );
    expect(extractCatalogSectionIntent("показання нурофен").query).toBe(
      "нурофен",
    );
  });
});
