import { describe, expect, it } from "vitest";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import { buildInteractionRuleRegistry } from "../audit";
import { createVerifiedInteractionEngine } from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
} from "../model";
import { evaluateInteractionRuleEligibility } from "../policy";
import { verifiedInteractionRulesBatch5 } from "../verifiedRules.batch5";

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

describe("verified interaction registry batch 5", () => {
  it("contains five unique, runtime-eligible exact-INN rules", () => {
    expect(verifiedInteractionRulesBatch5).toHaveLength(5);
    expect(
      new Set(verifiedInteractionRulesBatch5.map((rule) => rule.pairKey)).size,
    ).toBe(verifiedInteractionRulesBatch5.length);
    expect(
      verifiedInteractionRulesBatch5.every(
        (rule) => evaluateInteractionRuleEligibility(rule).eligible,
      ),
    ).toBe(true);
  });

  it("uses only canonical English INNs present in the dictionary", () => {
    const canonicalEnglish = new Set(
      ingredientSeeds.map((seed) => seed.english),
    );
    for (const rule of verifiedInteractionRulesBatch5) {
      expect(canonicalEnglish.has(rule.ingredientA)).toBe(true);
      expect(canonicalEnglish.has(rule.ingredientB)).toBe(true);
    }
  });

  it.each([
    ["Tizanidine", "Ciprofloxacin", "contraindicated"],
    ["Clopidogrel", "Esomeprazole", "major"],
    ["Simvastatin", "Amlodipine", "moderate"],
    ["Apixaban", "Carbamazepine", "major"],
    ["Rivaroxaban", "Carbamazepine", "major"],
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
      expect(result.findings[0]?.rule.reviewedAt).toBe("2026-07-29");
    },
  );

  it.each([
    ["Tizanidine", "Azithromycin"],
    ["Clopidogrel", "Pantoprazole"],
    ["Apixaban", "Valproic acid"],
  ])(
    "does not expand %s evidence to unsupported %s",
    (ingredientA, ingredientB) => {
      expect(check(ingredientA, ingredientB).findings).toEqual([]);
    },
  );

  it("preserves the simvastatin dose limitation", () => {
    const rule = verifiedInteractionRulesBatch5.find(
      (candidate) =>
        candidate.pairKey ===
        normalizedInteractionPairKey("Simvastatin", "Amlodipine"),
    );

    expect(rule?.actionCategory).toBe("specialist_review");
    expect(rule?.explanation).toContain("максимум 20 мг на добу");
    expect(rule?.explanation).toContain("не самостійна зміна терапії");
  });

  it("keeps sources complete and free of secrets or local paths", () => {
    for (const rule of verifiedInteractionRulesBatch5) {
      expect(rule.source.url).toMatch(/^https:\/\//);
      expect(rule.source.documentReference).toBeTruthy();
      expect(rule.source.version).toBeTruthy();
      expect(rule.source.publishedAt).toBeTruthy();
      expect(rule.source.accessedAt).toBe("2026-07-29");
      expect(rule.provenance.datasetVersion).toBe(
        "verified-interactions-v1.4.0",
      );
      expect(rule.provenance.sourceRecordId).toBe(rule.id);
    }

    const serialized = JSON.stringify(verifiedInteractionRulesBatch5);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
