import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  getDictionaryStats,
  listDictionaryEntries,
} from "../dictionary";

describe("dictionary", () => {
  it("contains at least 500 name mappings", () => {
    expect(getDictionaryStats().mappings).toBeGreaterThanOrEqual(500);
  });

  it("resolves Ukrainian brand names to the canonical ingredient", () => {
    expect(normalizeQuery("Нурофен")?.ingredient.english).toBe("Ibuprofen");
    expect(normalizeQuery("Панадол")?.ingredient.english).toBe("Paracetamol");
    expect(normalizeQuery("Амоксиклав")?.ingredient.english).toBe(
      "Amoxicillin + clavulanic acid",
    );
  });

  it("resolves Latin and English names", () => {
    expect(normalizeQuery("Ibuprofenum")?.ingredient.inn).toBe("Ібупрофен");
    expect(normalizeQuery("Paracetamol")?.ingredient.inn).toBe("Парацетамол");
    expect(normalizeQuery("Augmentin")?.ingredient.english).toContain(
      "Amoxicillin",
    );
  });

  it("resolves explicit synonyms (US generic names)", () => {
    expect(normalizeQuery("acetaminophen")?.ingredient.inn).toBe("Парацетамол");
    expect(normalizeQuery("albuterol")?.ingredient.english).toBe("Salbutamol");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeQuery("  НУРОФЕН  ")?.ingredient.english).toBe("Ibuprofen");
  });

  it("returns null for unknown queries", () => {
    expect(normalizeQuery("zzzznotadrug")).toBeNull();
    expect(normalizeQuery("")).toBeNull();
  });

  it("every entry points at a canonical ingredient with an ATC code", () => {
    for (const e of listDictionaryEntries()) {
      expect(e.ingredient.inn.length).toBeGreaterThan(0);
      expect(e.ingredient.atc.length).toBeGreaterThan(0);
    }
  });
});
