import { describe, expect, it } from "vitest";
import { conciseCatalogStrength } from "@workspace/catalog-index";

describe("conciseCatalogStrength", () => {
  it("drops a denominator that only repeats the dosage form", () => {
    expect(conciseCatalogStrength("20 міліграм(и) / 1 Капсула")).toBe("20 мг");
    expect(conciseCatalogStrength("500 міліграм(и) / 1 Таблетка")).toBe(
      "500 мг",
    );
    expect(conciseCatalogStrength("1 грам(и) / 1 Флакон")).toBe("1 г");
  });

  it("keeps a denominator that states a measured quantity", () => {
    expect(conciseCatalogStrength("10 міліграм(и) / 1 мілілітр(и)")).toBe(
      "10 мг/мл",
    );
    expect(conciseCatalogStrength("1 міліграм(и) / 5 мілілітр(и)")).toBe(
      "1 мг/5 мл",
    );
  });

  it("never rescales a dose", () => {
    // 0.005 г is 5 мг, but converting would put a float rounding error on a
    // medicine strength for no clinical gain.
    expect(conciseCatalogStrength("0.005 грам(и) / 1 Таблетка")).toBe(
      "0,005 г",
    );
  });

  it("drops the redundant denominator of every component of a combination", () => {
    expect(
      conciseCatalogStrength(
        "0.5 грам(и) / 1 Таблетка + 30 міліграм(и) / 1 Таблетка",
      ),
    ).toBe("0,5 г + 30 мг");
  });

  it("repeats a measured basis rather than letting it read as the last component's", () => {
    // `2 мг + 5 мг/мл` would suggest only the second component is per
    // millilitre, so the basis is written out on both.
    expect(
      conciseCatalogStrength(
        "2 міліграм(и) / 1 мілілітр(и) + 5 міліграм(и) / 1 мілілітр(и)",
      ),
    ).toBe("2 мг/мл + 5 мг/мл");
  });

  it("returns an unparseable or unlisted value unchanged", () => {
    expect(conciseCatalogStrength("безстроково")).toBe("безстроково");
    expect(
      conciseCatalogStrength("45 Терапевтична одиниця (ТО) / 1 Таблетка"),
    ).toBe("45 Терапевтична одиниця (ТО)");
    expect(conciseCatalogStrength("")).toBe("");
  });
});
