import { describe, expect, it } from "vitest";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import { buildInteractionRuleRegistry } from "../audit";
import { createVerifiedInteractionEngine } from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
} from "../model";
import { evaluateInteractionRuleEligibility } from "../policy";
import { verifiedInteractionRulesBatch4 } from "../verifiedRules.batch4";

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

describe("verified interaction registry batch 4", () => {
  it("contains three unique, runtime-eligible exact-INN rules", () => {
    expect(verifiedInteractionRulesBatch4).toHaveLength(3);
    expect(
      new Set(verifiedInteractionRulesBatch4.map((rule) => rule.pairKey)).size,
    ).toBe(verifiedInteractionRulesBatch4.length);
    expect(
      verifiedInteractionRulesBatch4.every(
        (rule) => evaluateInteractionRuleEligibility(rule).eligible,
      ),
    ).toBe(true);
  });

  it("uses only canonical English INNs present in the dictionary", () => {
    const canonicalEnglish = new Set(
      ingredientSeeds.map((seed) => seed.english),
    );
    for (const rule of verifiedInteractionRulesBatch4) {
      expect(canonicalEnglish.has(rule.ingredientA)).toBe(true);
      expect(canonicalEnglish.has(rule.ingredientB)).toBe(true);
    }
  });

  it.each([
    ["Apixaban", "Naproxen", "major"],
    ["Rivaroxaban", "Naproxen", "major"],
    ["Celecoxib", "Warfarin", "major"],
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
    ["Rivaroxaban", "Meloxicam"],
    ["Celecoxib", "Apixaban"],
  ])(
    "does not expand %s evidence to unsupported %s",
    (ingredientA, ingredientB) => {
      const result = check(ingredientA, ingredientB);

      expect(result.findings).toEqual([]);
    },
  );

  it("preserves exact evidence limitations for both naproxen pairs", () => {
    const apixaban = verifiedInteractionRulesBatch4.find(
      (rule) =>
        rule.pairKey === normalizedInteractionPairKey("Apixaban", "Naproxen"),
    );
    const rivaroxaban = verifiedInteractionRulesBatch4.find(
      (rule) =>
        rule.pairKey ===
        normalizedInteractionPairKey("Rivaroxaban", "Naproxen"),
    );

    expect(apixaban?.explanation).toContain("здорових дорослих");
    expect(apixaban?.explanation).toContain(
      "клінічно значущого подовження часу кровотечі не спостерігали",
    );
    expect(rivaroxaban?.explanation).toContain(
      "не змінював фармакокінетику ривароксабану",
    );
    expect(rivaroxaban?.explanation).toContain(
      "не виключає фармакодинамічного ризику",
    );
  });

  it("keeps sources complete and free of secrets or local paths", () => {
    for (const rule of verifiedInteractionRulesBatch4) {
      expect(rule.source.url).toMatch(/^https:\/\//);
      expect(rule.source.documentReference).toBeTruthy();
      expect(rule.source.version).toBeTruthy();
      expect(rule.source.publishedAt).toBeTruthy();
      expect(rule.source.accessedAt).toBe("2026-07-27");
      expect(rule.provenance.datasetVersion).toBe(
        "verified-interactions-v1.3.0",
      );
      expect(rule.provenance.sourceRecordId).toBe(rule.id);
    }

    const serialized = JSON.stringify(verifiedInteractionRulesBatch4);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
