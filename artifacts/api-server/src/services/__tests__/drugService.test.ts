import { describe, it, expect } from "vitest";
import {
  searchDrugs,
  getDrugById,
  getStats,
  getDrugsByIds,
  getAllDrugs,
  findDrugsInText,
} from "../drugService";

describe("drugService.searchDrugs", () => {
  it("finds a drug by brand name", () => {
    const results = searchDrugs("ібупрофен", "brand");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((d) => d.brandName === "Ібупрофен")).toBe(true);
  });

  it("finds drugs by active ingredient (INN)", () => {
    const results = searchDrugs("парацетамол", "inn");
    // Both Парацетамол and Панадол share the INN Парацетамол.
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(
      results.every((d) => d.inn.toLowerCase().includes("парацетамол")),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    const lower = searchDrugs("аспірин");
    const upper = searchDrugs("АСПІРИН");
    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBeGreaterThan(0);
  });

  it("searches by ATC code", () => {
    const results = searchDrugs("M01AE01", "atc");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((d) => d.atcCode === "M01AE01")).toBe(true);
  });

  it("returns the full sorted catalog for an empty query", () => {
    const results = searchDrugs("");
    expect(results.length).toBeGreaterThanOrEqual(30);
  });

  it("returns nothing for a nonsense query", () => {
    expect(searchDrugs("zzzznonexistent").length).toBe(0);
  });
});

describe("drugService lookups", () => {
  it("gets a drug by id", () => {
    const drug = getDrugById("ibuprofen-200");
    expect(drug).toBeDefined();
    expect(drug?.brandName).toBe("Ібупрофен");
  });

  it("returns undefined for an unknown id", () => {
    expect(getDrugById("does-not-exist")).toBeUndefined();
  });

  it("resolves multiple ids and skips unknown ones", () => {
    const drugs = getDrugsByIds(["ibuprofen-200", "nope", "warfarin-5"]);
    expect(drugs.map((d) => d.id)).toEqual(["ibuprofen-200", "warfarin-5"]);
  });
});

describe("drugService.searchDrugs field variants", () => {
  it("matches by pharmaceutical form", () => {
    const results = searchDrugs("таблетки", "form");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((d) => d.form.toLowerCase().includes("таблетки")),
    ).toBe(true);
  });

  it("trims surrounding whitespace before matching", () => {
    const padded = searchDrugs("  аспірин  ");
    const clean = searchDrugs("аспірин");
    expect(padded.map((d) => d.id)).toEqual(clean.map((d) => d.id));
  });

  it("returns results sorted by brand name", () => {
    const results = searchDrugs("");
    const names = results.map((d) => d.brandName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "uk"));
    expect(names).toEqual(sorted);
  });

  it("does not mutate the underlying catalog on empty query", () => {
    const first = searchDrugs("");
    first.reverse();
    const second = searchDrugs("");
    expect(second).not.toEqual(first);
  });
});

describe("drugService.findDrugsInText", () => {
  it("detects a brand name embedded in free text", () => {
    const { detectedName, matches } = findDrugsInText(
      "Пацієнт приймає Ібупрофен 200 мг двічі на день",
    );
    expect(detectedName).toBe("Ібупрофен");
    expect(matches.some((d) => d.brandName === "Ібупрофен")).toBe(true);
  });

  it("detects a drug by its INN", () => {
    const { matches } = findDrugsInText("склад: парацетамол");
    expect(
      matches.some((d) => d.inn.toLowerCase().includes("парацетамол")),
    ).toBe(true);
  });

  it("returns no matches and a null name for unrelated text", () => {
    const { detectedName, matches } = findDrugsInText(
      "немає жодного препарату",
    );
    expect(detectedName).toBeNull();
    expect(matches).toHaveLength(0);
  });
});

describe("drugService.getAllDrugs", () => {
  it("returns the full catalog", () => {
    expect(getAllDrugs().length).toBe(getStats().totalDrugs);
  });
});

describe("drugService.getStats", () => {
  it("reports at least 30 demo drugs", () => {
    const stats = getStats();
    expect(stats.totalDrugs).toBeGreaterThanOrEqual(30);
    expect(stats.totalGroups).toBeGreaterThan(0);
    const sum = stats.groups.reduce((acc, g) => acc + g.count, 0);
    expect(sum).toBe(stats.totalDrugs);
  });
});
