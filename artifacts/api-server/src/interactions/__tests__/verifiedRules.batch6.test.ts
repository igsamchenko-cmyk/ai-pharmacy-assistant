import { describe, expect, it } from "vitest";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import { buildInteractionRuleRegistry } from "../audit";
import { createVerifiedInteractionEngine } from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
} from "../model";
import { evaluateInteractionRuleEligibility } from "../policy";
import { verifiedInteractionRulesBatch6 } from "../verifiedRules.batch6";

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

describe("verified interaction registry batch 6", () => {
  it("contains six unique, runtime-eligible exact-INN rules", () => {
    expect(verifiedInteractionRulesBatch6).toHaveLength(6);
    expect(
      new Set(verifiedInteractionRulesBatch6.map((rule) => rule.pairKey)).size,
    ).toBe(verifiedInteractionRulesBatch6.length);
    expect(
      verifiedInteractionRulesBatch6.every(
        (rule) => evaluateInteractionRuleEligibility(rule).eligible,
      ),
    ).toBe(true);
  });

  it("uses only canonical English INNs present in the dictionary", () => {
    const canonicalEnglish = new Set(
      ingredientSeeds.map((seed) => seed.english),
    );
    for (const rule of verifiedInteractionRulesBatch6) {
      expect(canonicalEnglish.has(rule.ingredientA)).toBe(true);
      expect(canonicalEnglish.has(rule.ingredientB)).toBe(true);
    }
  });

  it.each([
    ["Clarithromycin", "Digoxin", "major"],
    ["Clarithromycin", "Warfarin", "major"],
    ["Fluconazole", "Warfarin", "major"],
    ["Fluconazole", "Celecoxib", "moderate"],
    ["Sildenafil", "Amlodipine", "moderate"],
    ["Azithromycin", "Warfarin", "moderate"],
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
    ["Clarithromycin", "Apixaban"],
    ["Fluconazole", "Meloxicam"],
    ["Sildenafil", "Enalapril"],
    ["Azithromycin", "Digoxin"],
  ])(
    "does not expand %s evidence to unsupported %s",
    (ingredientA, ingredientB) => {
      expect(check(ingredientA, ingredientB).findings).toEqual([]);
    },
  );

  it("preserves the bounded azithromycin and warfarin evidence", () => {
    const rule = verifiedInteractionRulesBatch6.find(
      (candidate) =>
        candidate.pairKey ===
        normalizedInteractionPairKey("Azithromycin", "Warfarin"),
    );

    expect(rule?.evidenceLevel).toBe("reference");
    expect(rule?.explanation).toContain(
      "не виявило впливу азитроміцину на протромбіновий час",
    );
    expect(rule?.explanation).toContain("постмаркетингові повідомлення");
  });

  it("preserves tested doses and quantitative exposure limits", () => {
    const celecoxib = verifiedInteractionRulesBatch6.find(
      (candidate) =>
        candidate.pairKey ===
        normalizedInteractionPairKey("Fluconazole", "Celecoxib"),
    );
    const amlodipine = verifiedInteractionRulesBatch6.find(
      (candidate) =>
        candidate.pairKey ===
        normalizedInteractionPairKey("Sildenafil", "Amlodipine"),
    );

    expect(celecoxib?.actionCategory).toBe("specialist_review");
    expect(celecoxib?.explanation).toContain("Cmax");
    expect(celecoxib?.explanation).toContain("68%");
    expect(celecoxib?.explanation).toContain("134%");
    expect(celecoxib?.explanation).toContain("половинна доза");
    expect(amlodipine?.explanation).toContain("силденафіл 100 мг");
    expect(amlodipine?.explanation).toContain("амлодипіну 5 або 10 мг");
    expect(amlodipine?.explanation).toContain("8/7 мм рт. ст.");
  });

  it("keeps sources complete and free of secrets or local paths", () => {
    for (const rule of verifiedInteractionRulesBatch6) {
      expect(rule.source.url?.startsWith("https://")).toBe(true);
      expect(rule.source.documentReference).toBeTruthy();
      expect(rule.source.version).toBeTruthy();
      expect(rule.source.publishedAt).toBeTruthy();
      expect(rule.source.accessedAt).toBe("2026-07-29");
      expect(rule.provenance.datasetVersion).toBe(
        "verified-interactions-v1.5.0",
      );
      expect(rule.provenance.sourceRecordId).toBe(rule.id);
    }

    const serialized = JSON.stringify(verifiedInteractionRulesBatch6);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("C:");
    expect(serialized).not.toContain("/home/");
  });
});
