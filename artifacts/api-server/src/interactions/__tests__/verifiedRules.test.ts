import { describe, expect, it } from "vitest";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import { buildInteractionRuleRegistry } from "../audit";
import { createVerifiedInteractionEngine } from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
} from "../model";
import { evaluateInteractionRuleEligibility } from "../policy";
import { verifiedInteractionRules } from "../verifiedRules";

function selection(id: string, ingredient: string): InteractionSelection {
  return {
    id,
    label: ingredient,
    ingredients: [{ canonicalName: ingredient, therapeuticGroups: [] }],
    unresolvedIngredients: [],
  };
}

describe("verified interaction registry", () => {
  it("contains twenty-seven unique, runtime-eligible exact-INN rules", () => {
    expect(verifiedInteractionRules).toHaveLength(27);
    expect(
      new Set(verifiedInteractionRules.map((rule) => rule.pairKey)).size,
    ).toBe(verifiedInteractionRules.length);
    expect(
      verifiedInteractionRules.every(
        (rule) => evaluateInteractionRuleEligibility(rule).eligible,
      ),
    ).toBe(true);
  });

  it("uses only canonical English INNs present in the dictionary", () => {
    const canonicalEnglish = new Set(
      ingredientSeeds.map((seed) => seed.english),
    );
    for (const rule of verifiedInteractionRules) {
      expect(canonicalEnglish.has(rule.ingredientA)).toBe(true);
      expect(canonicalEnglish.has(rule.ingredientB)).toBe(true);
    }
  });

  it.each([
    ["Warfarin", "Ibuprofen", "major"],
    ["Apixaban", "Ibuprofen", "major"],
    ["Rivaroxaban", "Ibuprofen", "major"],
    ["Sildenafil", "Nitroglycerin", "contraindicated"],
    ["Sildenafil", "Isosorbide dinitrate", "contraindicated"],
    ["Clarithromycin", "Simvastatin", "contraindicated"],
    ["Enalapril", "Spironolactone", "major"],
    ["Warfarin", "Acetylsalicylic acid", "major"],
    ["Warfarin", "Diclofenac", "major"],
    ["Clopidogrel", "Omeprazole", "major"],
    ["Amiodarone", "Digoxin", "major"],
    ["Amiodarone", "Warfarin", "major"],
    ["Amiodarone", "Simvastatin", "major"],
    ["Apixaban", "Acetylsalicylic acid", "major"],
    ["Apixaban", "Clopidogrel", "major"],
    ["Rivaroxaban", "Acetylsalicylic acid", "major"],
    ["Rivaroxaban", "Clopidogrel", "major"],
    ["Clopidogrel", "Warfarin", "major"],
    ["Acetylsalicylic acid", "Ibuprofen", "moderate"],
  ])(
    "returns the reviewed finding for %s + %s",
    (ingredientA, ingredientB, severity) => {
      const result = createVerifiedInteractionEngine(
        buildInteractionRuleRegistry(),
      ).check([selection("a", ingredientA), selection("b", ingredientB)]);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.rule.pairKey).toBe(
        normalizedInteractionPairKey(ingredientA, ingredientB),
      );
      expect(result.findings[0]?.rule.severity).toBe(severity);
      expect(result.findings[0]?.rule.reviewStatus).toBe("approved");
      expect(result.findings[0]?.rule.reviewedAt).toMatch(
        /^2026-07-(26|27|29)$/,
      );
    },
  );

  it("does not expand an exact NSAID rule to another ingredient", () => {
    const result = createVerifiedInteractionEngine(
      buildInteractionRuleRegistry(),
    ).check([
      selection("apixaban", "Apixaban"),
      selection("meloxicam", "Meloxicam"),
    ]);

    expect(result.findings).toEqual([]);
    expect(result.coverage.message).toContain(
      "не знайдено підтвердженого правила",
    );
  });

  it("keeps sources complete and free of secrets or local paths", () => {
    for (const rule of verifiedInteractionRules) {
      expect(rule.source.url).toMatch(/^https:\/\//);
      expect(rule.source.documentReference).toBeTruthy();
      expect(rule.source.version).toBeTruthy();
      expect(rule.source.publishedAt).toBeTruthy();
      expect(rule.source.accessedAt).toMatch(/^2026-07-(26|27|29)$/);
      expect(rule.provenance.sourceRecordId).toBe(rule.id);
    }

    const serialized = JSON.stringify(verifiedInteractionRules);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
