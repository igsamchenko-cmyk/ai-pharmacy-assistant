import { describe, expect, it } from "vitest";
import {
  favoritesAliasTarget,
  instructionAliasTarget,
  instructionSectionShareUrl,
  instructionSectionTarget,
  productCardTabFromSearch,
  productCardTabTarget,
  savedTabFromSearch,
  legacyDrugSearchTarget,
  ocrSearchText,
  scanOpenFromSearch,
  searchAliasTarget,
  searchUrlWithQuery,
  searchUrlWithScan,
} from "./navigation-v3";

describe("Navigation v3 PR-D redirects", () => {
  it("moves /search to the root without losing its query", () => {
    expect(searchAliasTarget("?q=нурофен&type=registry_products")).toBe(
      "/?q=нурофен&type=registry_products",
    );
    expect(searchAliasTarget("")).toBe("/");
  });

  it("makes /products the canonical card and preserves instruction context", () => {
    expect(
      instructionAliasTarget("ABC 123", "?registration=UA%2F1%2F01%2F01"),
    ).toBe(
      "/products/ABC%20123?registration=UA%2F1%2F01%2F01&tab=instruction#instruction",
    );
    expect(instructionAliasTarget("ABC", "?tab=profile", "#freshness")).toBe(
      "/products/ABC?tab=profile#freshness",
    );
  });

  it("resolves legacy IDs through a normalized search instead of mapping IDs", () => {
    expect(legacyDrugSearchTarget("  Нурофен®  ")).toBe(
      "/search?q=%D0%9D%D1%83%D1%80%D0%BE%D1%84%D0%B5%D0%BD%C2%AE",
    );
    expect(legacyDrugSearchTarget(null)).toBe("/search");
  });
});

describe("Navigation v3 root search state", () => {
  it("writes and clears q without dropping other parameters", () => {
    expect(
      searchUrlWithQuery("https://example.test/?type=all&scan=1", " Креон "),
    ).toBe("/?type=all&scan=1&q=%D0%9A%D1%80%D0%B5%D0%BE%D0%BD");
    expect(
      searchUrlWithQuery("https://example.test/?q=Креон&type=all", ""),
    ).toBe("/?type=all");
  });

  it("opens OCR from the URL and removes only the scan flag on close", () => {
    expect(scanOpenFromSearch("?q=креон&scan=1")).toBe(true);
    expect(scanOpenFromSearch("?scan=0")).toBe(false);
    expect(
      searchUrlWithScan("https://example.test/?q=креон&scan=1", false),
    ).toBe("/?q=%D0%BA%D1%80%D0%B5%D0%BE%D0%BD");
  });

  it("treats OCR text as query text and never as a product route", () => {
    expect(
      ocrSearchText({ detectedName: " Нурофен ", text: "Нурофен 200 мг" }),
    ).toBe("Нурофен");
    expect(ocrSearchText({ detectedName: null, text: " Креон 25000 " })).toBe(
      "Креон 25000",
    );
    expect(ocrSearchText({ detectedName: null, text: "" })).toBe("");
  });
});

describe("Navigation v3 PR-E card and saved tabs", () => {
  it("keeps ProductCard tabs in the canonical product URL", () => {
    expect(productCardTabFromSearch("?tab=analogs")).toBe("analogs");
    expect(productCardTabFromSearch("?tab=instruction")).toBe("instruction");
    expect(productCardTabFromSearch("?tab=unknown")).toBe("profile");
    expect(
      productCardTabTarget(
        "https://example.test/products/OLD?registration=UA%2F1%2F01%2F01",
        "ABC 123",
        "instruction",
      ),
    ).toBe(
      "/products/ABC%20123?registration=UA%2F1%2F01%2F01&tab=instruction#instruction",
    );
  });

  it("combines favorites and history without dropping alias parameters", () => {
    expect(savedTabFromSearch("?tab=favorites")).toBe("favorites");
    expect(savedTabFromSearch("?tab=other")).toBe("history");
    expect(favoritesAliasTarget("?source=menu")).toBe(
      "/history?source=menu&tab=favorites",
    );
  });
});

describe("Navigation v3 PR-H section anchors", () => {
  it("layers tab=instruction and a section hash onto an existing product href, keeping its query params", () => {
    expect(
      instructionSectionTarget(
        "/products/ABC?registration=UA%2F1%2F01%2F01",
        "pregnancyAndLactation",
      ),
    ).toBe(
      "/products/ABC?registration=UA%2F1%2F01%2F01&tab=instruction#instruction-pregnancyAndLactation",
    );
  });

  it("preserves a correctedQuery param and overwrites any pre-existing tab", () => {
    expect(
      instructionSectionTarget(
        "/products/ABC?registration=UA%2F1%2F01%2F01&correctedQuery=нурофен&tab=profile",
        "indications",
      ),
    ).toBe(
      "/products/ABC?registration=UA%2F1%2F01%2F01&correctedQuery=%D0%BD%D1%83%D1%80%D0%BE%D1%84%D0%B5%D0%BD&tab=instruction#instruction-indications",
    );
  });
});

describe("Navigation v3 PR-I share link", () => {
  it("builds an absolute, paste-ready link for a single instruction section", () => {
    expect(
      instructionSectionShareUrl(
        "https://farmassist.example",
        "ABC 123",
        "?registration=UA%2F1%2F01%2F01",
        "interactions",
      ),
    ).toBe(
      "https://farmassist.example/products/ABC%20123?registration=UA%2F1%2F01%2F01&tab=instruction#instruction-interactions",
    );
  });

  it("trims a trailing slash on the origin and tolerates an empty search", () => {
    expect(
      instructionSectionShareUrl(
        "https://farmassist.example/",
        "ABC",
        "",
        "storage",
      ),
    ).toBe(
      "https://farmassist.example/products/ABC?tab=instruction#instruction-storage",
    );
  });
});
