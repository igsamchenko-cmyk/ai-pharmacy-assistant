import { describe, expect, it } from "vitest";
import {
  instructionAliasTarget,
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
