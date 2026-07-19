import { describe, expect, it } from "vitest";

import type { ComparisonProductRef } from "@/hooks/use-product-comparison";
import {
  CLINICAL_EVIDENCE_COMPARISONS,
  EVIDENCE_REVIEWED_AT,
  findClinicalEvidenceComparison,
} from "./evidence-comparisons";

function product(productId: string, tradeName: string, inn: string): ComparisonProductRef {
  const registrationNumber = `UA/${Number.parseInt(productId.slice(0, 4), 16) || 1}/01/01`;
  return {
    productId: productId.padEnd(32, "A").slice(0, 32),
    registrationNumber,
    tradeName,
    inn,
    activeIngredient: inn,
    strength: "10 мг",
    dosageForm: "таблетки",
    manufacturer: "Офіційний виробник",
    nationalListStatus: "exact",
    instructionAvailable: false,
    href: `/products/${productId.padEnd(32, "A").slice(0, 32)}?registration=${encodeURIComponent(registrationNumber)}`,
  };
}

const cases = [
  {
    expected: "apixaban-rivaroxaban-af",
    left: product("A1", "ЕЛІКВІС", "апіксабан"),
    right: product("B1", "КСАРЕЛТО", "ривароксабан"),
  },
  {
    expected: "enalapril-lisinopril-hypertension",
    left: product("C1", "ЕНАП", "еналаприл"),
    right: product("D1", "ЛІЗИНОПРИЛ", "лізиноприл"),
  },
  {
    expected: "ibuprofen-naproxen-acute-pain",
    left: product("E1", "НУРОФЄН", "ібупрофен"),
    right: product("F1", "НАПРОКСЕН", "напроксен"),
  },
] as const;

describe("clinical evidence comparison registry", () => {
  it("contains exactly the three reviewed MVP pairs", () => {
    expect(CLINICAL_EVIDENCE_COMPARISONS).toHaveLength(3);
    expect(CLINICAL_EVIDENCE_COMPARISONS.map((item) => item.id)).toEqual(
      cases.map((item) => item.expected),
    );
  });

  it.each(cases)("matches $expected in either selected order", ({ expected, left, right }) => {
    expect(findClinicalEvidenceComparison([left, right])?.id).toBe(expected);
    expect(findClinicalEvidenceComparison([right, left])?.id).toBe(expected);
  });

  it("fails closed for an unsupported or combination INN", () => {
    expect(
      findClinicalEvidenceComparison([
        product("11", "КОМБІНАЦІЯ", "ібупрофен + парацетамол"),
        product("12", "НАПРОКСЕН", "напроксен"),
      ]),
    ).toBeNull();
    expect(
      findClinicalEvidenceComparison([
        product("13", "МЕТФОРМІН", "метформін"),
        product("14", "ОМЕПРАЗОЛ", "омепразол"),
      ]),
    ).toBeNull();
  });

  it("requires sources, review date, uncertainty and a neutral conclusion for every pair", () => {
    for (const comparison of CLINICAL_EVIDENCE_COMPARISONS) {
      expect(comparison.reviewedAt).toBe(EVIDENCE_REVIEWED_AT);
      expect(comparison.sources.length).toBeGreaterThanOrEqual(3);
      expect(comparison.sources.every((source) => /^https:\/\//u.test(source.url))).toBe(true);
      expect(comparison.insufficientData.toLocaleLowerCase("uk-UA")).toContain("недостатньо даних");
      expect(comparison.neutralConclusion).not.toMatch(/однозначно кращ|завжди кращ/iu);
      expect(comparison.effectivenessOutcomes.length).toBeGreaterThan(1);
      expect(comparison.keyRisks.length).toBeGreaterThan(1);
    }
  });
});
