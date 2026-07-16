import { describe, it, expect } from "vitest";
import {
  findUniqueSingleEditDictionaryMatch,
  normalizeQuery,
  resolveSourceBackedDictionaryQuery,
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

  it("resolves unique one-edit typos without approving new aliases", () => {
    expect(normalizeQuery("парацитамол")?.ingredient.inn).toBe("Парацетамол");
    expect(normalizeQuery("еліківс")?.ingredient.inn).toBe("Апіксабан");
    expect(
      listDictionaryEntries().some((entry) =>
        ["парацитамол", "еліківс"].includes(entry.name.toLowerCase()),
      ),
    ).toBe(false);
  });

  it("keeps catalog alias expansion source-backed and substring-free", () => {
    expect(resolveSourceBackedDictionaryQuery("vaccin")).toBeNull();
    expect(resolveSourceBackedDictionaryQuery("accident")).toBeNull();
    expect(resolveSourceBackedDictionaryQuery("ACC")).toBeNull();
    expect(resolveSourceBackedDictionaryQuery("mahniia sulfat")).toBeNull();
    expect(resolveSourceBackedDictionaryQuery("нурофен")).toMatchObject({
      name: "НУРОФЄН",
      ingredient: { inn: "Ібупрофен" },
      provenance: {
        sourceKey: "ua-state-expert-centre",
        evidenceLevel: "established",
      },
    });
    expect(resolveSourceBackedDictionaryQuery("еліківс")?.ingredient.inn).toBe(
      "Апіксабан",
    );
    expect(
      listDictionaryEntries().some((entry) => entry.name === "Нурофен"),
    ).toBe(false);
  });

  it("routes Форксига to the official ФОРКСІГА name without storing the typo", () => {
    const result = normalizeQuery("форксига");
    expect(result).toMatchObject({
      name: "ФОРКСІГА",
      ingredient: { inn: "Дапагліфлозин", atc: "A10BK01" },
      provenance: {
        sourceKey: "ukraine_state_drug_registry",
        evidenceLevel: "reference",
      },
    });
    expect(
      listDictionaryEntries().some((entry) => entry.name === "форксига"),
    ).toBe(false);
  });

  it("does not fuzzy-match short or unrelated input", () => {
    expect(normalizeQuery("нурф")).toBeNull();
    expect(normalizeQuery("zzzznotadrug")).toBeNull();
  });

  it("rejects one-edit matches that point to different ingredients", () => {
    const entries = listDictionaryEntries();
    const paracetamol = entries.find(
      (entry) => entry.ingredient.english === "Paracetamol",
    );
    const ibuprofen = entries.find(
      (entry) => entry.ingredient.english === "Ibuprofen",
    );
    expect(paracetamol).toBeDefined();
    expect(ibuprofen).toBeDefined();
    expect(
      findUniqueSingleEditDictionaryMatch("abcdef", [
        ["abcdeg", paracetamol!],
        ["abcdeh", ibuprofen!],
      ]),
    ).toBeNull();
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
