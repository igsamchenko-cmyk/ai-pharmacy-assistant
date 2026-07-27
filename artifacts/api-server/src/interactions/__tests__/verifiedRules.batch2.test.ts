import { describe, expect, it } from "vitest";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import { buildInteractionRuleRegistry } from "../audit";
import { createVerifiedInteractionEngine } from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
} from "../model";
import { evaluateInteractionRuleEligibility } from "../policy";
import { verifiedInteractionRulesBatch2 } from "../verifiedRules.batch2";

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

describe("verified interaction registry batch 2", () => {
  it("contains six unique, runtime-eligible exact-INN rules", () => {
    expect(verifiedInteractionRulesBatch2).toHaveLength(6);
    expect(
      new Set(verifiedInteractionRulesBatch2.map((rule) => rule.pairKey)).size,
    ).toBe(verifiedInteractionRulesBatch2.length);
    expect(
      verifiedInteractionRulesBatch2.every(
        (rule) => evaluateInteractionRuleEligibility(rule).eligible,
      ),
    ).toBe(true);
  });

  it("uses only canonical English INNs present in the dictionary", () => {
    const canonicalEnglish = new Set(
      ingredientSeeds.map((seed) => seed.english),
    );
    for (const rule of verifiedInteractionRulesBatch2) {
      expect(canonicalEnglish.has(rule.ingredientA)).toBe(true);
      expect(canonicalEnglish.has(rule.ingredientB)).toBe(true);
    }
  });

  it.each([
    ["Warfarin", "Acetylsalicylic acid", "major"],
    ["Warfarin", "Diclofenac", "major"],
    ["Clopidogrel", "Omeprazole", "major"],
    ["Amiodarone", "Digoxin", "major"],
    ["Amiodarone", "Warfarin", "major"],
    ["Amiodarone", "Simvastatin", "major"],
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
    ["Warfarin", "Naproxen"],
    ["Clopidogrel", "Pantoprazole"],
    ["Amiodarone", "Atorvastatin"],
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

  it("keeps sources complete and free of secrets or local paths", () => {
    for (const rule of verifiedInteractionRulesBatch2) {
      expect(rule.source.url).toMatch(/^https:\/\//);
      expect(rule.source.documentReference).toBeTruthy();
      expect(rule.source.version).toBeTruthy();
      expect(rule.source.publishedAt).toBeTruthy();
      expect(rule.source.accessedAt).toBe("2026-07-27");
      expect(rule.provenance.datasetVersion).toBe(
        "verified-interactions-v1.1.0",
      );
      expect(rule.provenance.sourceRecordId).toBe(rule.id);
    }

    const serialized = JSON.stringify(verifiedInteractionRulesBatch2);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
