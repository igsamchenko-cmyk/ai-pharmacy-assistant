import { describe, expect, it } from "vitest";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import { buildInteractionRuleRegistry } from "../audit";
import { createVerifiedInteractionEngine } from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
} from "../model";
import { evaluateInteractionRuleEligibility } from "../policy";
import { verifiedInteractionRulesBatch3 } from "../verifiedRules.batch3";

function selection(id: string, ingredient: string): InteractionSelection {
  return {
    id,
    label: ingredient,
    ingredients: [{ canonicalName: ingredient, therapeuticGroups: [] }],
    unresolvedIngredients: [],
  };
}

function check(ingredientA: string, ingredientB: string) {
  return createVerifiedInteractionEngine(buildInteractionRuleRegistry()).check([
    selection("a", ingredientA),
    selection("b", ingredientB),
  ]);
}

describe("verified interaction registry batch 3", () => {
  it("contains six unique, runtime-eligible exact-INN rules", () => {
    expect(verifiedInteractionRulesBatch3).toHaveLength(6);
    expect(
      new Set(verifiedInteractionRulesBatch3.map((rule) => rule.pairKey)).size,
    ).toBe(verifiedInteractionRulesBatch3.length);
    expect(
      verifiedInteractionRulesBatch3.every(
        (rule) => evaluateInteractionRuleEligibility(rule).eligible,
      ),
    ).toBe(true);
  });

  it("uses only canonical English INNs present in the dictionary", () => {
    const canonicalEnglish = new Set(
      ingredientSeeds.map((seed) => seed.english),
    );
    for (const rule of verifiedInteractionRulesBatch3) {
      expect(canonicalEnglish.has(rule.ingredientA)).toBe(true);
      expect(canonicalEnglish.has(rule.ingredientB)).toBe(true);
    }
  });

  it.each([
    ["Apixaban", "Acetylsalicylic acid", "major"],
    ["Apixaban", "Clopidogrel", "major"],
    ["Rivaroxaban", "Acetylsalicylic acid", "major"],
    ["Rivaroxaban", "Clopidogrel", "major"],
    ["Clopidogrel", "Warfarin", "major"],
    ["Acetylsalicylic acid", "Ibuprofen", "moderate"],
  ])(
    "returns the reviewed finding for %s + %s",
    (ingredientA, ingredientB, severity) => {
      const result = check(ingredientA, ingredientB);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.rule.pairKey).toBe(
        normalizedInteractionPairKey(ingredientA, ingredientB),
      );
      expect(result.findings[0]?.rule.severity).toBe(severity);
      expect(result.findings[0]?.rule.reviewStatus).toBe("approved");
      expect(result.findings[0]?.rule.reviewedAt).toBe("2026-07-27");
    },
  );

  it.each([
    ["Apixaban", "Diclofenac"],
    ["Rivaroxaban", "Naproxen"],
    ["Clopidogrel", "Naproxen"],
  ])(
    "does not expand %s rules to the unsupported exact pair with %s",
    (ingredientA, ingredientB) => {
      const result = check(ingredientA, ingredientB);

      expect(result.findings).toEqual([]);
      expect(result.coverage.message).toContain(
        "не знайдено підтвердженого правила",
      );
    },
  );

  it("preserves the dosing-context caveat for aspirin plus ibuprofen", () => {
    const rule = verifiedInteractionRulesBatch3.find(
      (candidate) =>
        candidate.pairKey ===
        normalizedInteractionPairKey("Acetylsalicylic acid", "Ibuprofen"),
    );

    expect(rule?.severity).toBe("moderate");
    expect(rule?.evidenceLevel).toBe("reference");
    expect(rule?.explanation).toContain("епізодичному застосуванні");
    expect(rule?.populationContext).toContain("регулярно");
  });

  it("keeps sources complete and free of secrets or local paths", () => {
    for (const rule of verifiedInteractionRulesBatch3) {
      expect(rule.source.url).toMatch(/^https:\/\//);
      expect(rule.source.documentReference).toBeTruthy();
      expect(rule.source.version).toBeTruthy();
      expect(rule.source.publishedAt).toBeTruthy();
      expect(rule.source.accessedAt).toBe("2026-07-27");
      expect(rule.provenance.datasetVersion).toBe(
        "verified-interactions-v1.2.0",
      );
      expect(rule.provenance.sourceRecordId).toBe(rule.id);
    }

    const serialized = JSON.stringify(verifiedInteractionRulesBatch3);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
