import { describe, expect, it } from "vitest";

import type { ComparisonProductRef } from "@/hooks/use-product-comparison";
import evidenceRegistryIndex from "./evidence-comparison-registry-index.json";
import {
  EVIDENCE_REGISTRY,
  EVIDENCE_REVIEWED_AT,
  exactCompositionIdentity,
  resolveEvidenceComparison,
} from "./evidence-comparisons";

function product(
  productId: string,
  tradeName: string,
  inn: string,
  atcCode: string | null,
): ComparisonProductRef {
  const exactId = productId.padEnd(32, "A").slice(0, 32);
  const registrationNumber = `UA/${Number.parseInt(productId.slice(0, 4), 16) || 1}/01/01`;
  return {
    productId: exactId,
    registrationNumber,
    tradeName,
    inn,
    atcCode,
    activeIngredient: inn,
    strength: "10 мг",
    dosageForm: "таблетки",
    manufacturer: "Офіційний виробник",
    nationalListStatus: "exact",
    instructionAvailable: false,
    href: `/products/${exactId}?registration=${encodeURIComponent(registrationNumber)}`,
  };
}

const cases = [
  {
    id: "apixaban-rivaroxaban-af",
    indicationId: "atrial-fibrillation-stroke-prevention",
    directness: "mixed",
    left: product("A1", "ЕЛІКВІС", "апіксабан", "B01AF02"),
    right: product("B1", "КСАРЕЛТО", "ривароксабан", "B01AF01"),
  },
  {
    id: "enalapril-lisinopril-hypertension",
    indicationId: "primary-arterial-hypertension",
    directness: "direct",
    left: product("C1", "ЕНАП", "еналаприл", "C09AA02"),
    right: product("D1", "ЛІЗИНОПРИЛ", "лізиноприл", "C09AA03"),
  },
  {
    id: "ibuprofen-naproxen-acute-pain",
    indicationId: "acute-postoperative-dental-pain",
    directness: "mixed",
    left: product("E1", "НУРОФЕН", "ібупрофен", "M01AE01"),
    right: product("F1", "НАПРОКСЕН", "напроксен", "M01AE02"),
  },
  {
    id: "paracetamol-ibuprofen-acute-dental-pain",
    indicationId: "acute-postoperative-dental-pain",
    directness: "mixed",
    left: product("71", "ПАРАЦЕТАМОЛ", "парацетамол", "N02BE01"),
    right: product("72", "НУРОФЕН", "ібупрофен", "M01AE01"),
  },
  {
    id: "amlodipine-lisinopril-high-risk-hypertension",
    indicationId: "high-risk-primary-hypertension",
    directness: "direct",
    left: product("73", "АМЛОДИПІН", "амлодипін", "C08CA01"),
    right: product("74", "ЛІЗИНОПРИЛ", "лізиноприл", "C09AA03"),
  },
] as const;

describe("generic evidence registry and resolver", () => {
  it("uses reviewed records as generic INN/indication registry entries", () => {
    expect(EVIDENCE_REGISTRY).toHaveLength(5);
    expect(EVIDENCE_REGISTRY.map((item) => item.id)).toEqual(
      cases.map((item) => item.id),
    );

    for (const record of EVIDENCE_REGISTRY) {
      expect(record.comparators).toHaveLength(2);
      expect(record.indication.id).toBeTruthy();
      expect(record.indication.population).toBeTruthy();
      expect(record.indication.outcomes.length).toBeGreaterThan(0);
      expect(record.applicability).toEqual({
        compositionMatch: "exact",
        comparisonLevel: "ingredient",
        productSpecificConclusion: false,
        dosageForms: "not_assessed",
        strengths: "not_assessed",
        combinations: "excluded",
      });
    }
  });

  it.each(cases)(
    "requires indication, then resolves $id in either order",
    ({ id, indicationId, directness, left, right }) => {
      const pending = resolveEvidenceComparison([left, right]);
      expect(pending.status).toBe("indication_required");
      expect(pending.comparison).toBeNull();
      expect(pending.availableIndications.map((item) => item.id)).toContain(
        indicationId,
      );

      for (const pair of [
        [left, right],
        [right, left],
      ] as const) {
        const resolved = resolveEvidenceComparison(pair, indicationId);
        expect(resolved.status).toBe("verified");
        expect(resolved.comparison?.id).toBe(id);
        expect(resolved.directness).toBe(directness);
      }
    },
  );

  it("classifies pairs independently from evidence availability", () => {
    const sameIngredient = resolveEvidenceComparison([
      product("11", "ЕНАП", "еналаприл", "C09AA02"),
      product("12", "ЕНАЛАПРИЛ КРКА", "еналаприл", "C09AA02"),
    ]);
    expect(sameIngredient.classification).toBe("same_ingredient");
    expect(sameIngredient.status).toBe("insufficient");

    const sameClass = resolveEvidenceComparison([
      product("13", "ІБУПРОФЕН", "ібупрофен", "M01AE01"),
      product("14", "КЕТОПРОФЕН", "кетопрофен", "M01AE03"),
    ]);
    expect(sameClass.classification).toBe("same_therapeutic_class");
    expect(sameClass.status).toBe("insufficient");

    const alternatives = resolveEvidenceComparison([
      product("15", "ЕЛІКВІС", "апіксабан", "B01AF02"),
      product("16", "КСАРЕЛТО", "ривароксабан", "B01AX06"),
    ]);
    expect(alternatives.classification).toBe("clinical_alternatives");

    const unrelated = resolveEvidenceComparison([
      product("17", "МЕТФОРМІН", "метформін", "A10BA02"),
      product("18", "ОМЕПРАЗОЛ", "омепразол", "A02BC01"),
    ]);
    expect(unrelated.classification).toBe("not_meaningfully_comparable");
    expect(unrelated.message).toContain("Надійного порівняння немає");
  });

  it("fails closed for combinations, missing composition and wrong indication", () => {
    const combination = product(
      "21",
      "КОМБІНАЦІЯ",
      "ібупрофен + парацетамол",
      "M01AE51",
    );
    expect(exactCompositionIdentity(combination)).toMatchObject({
      kind: "combination",
      components: ["парацетамол", "ібупрофен"],
    });
    expect(
      resolveEvidenceComparison([
        combination,
        product("22", "НАПРОКСЕН", "напроксен", "M01AE02"),
      ]).status,
    ).toBe("insufficient");

    expect(
      resolveEvidenceComparison([
        product("23", "БЕЗ МНН", "", null),
        product("24", "НАПРОКСЕН", "напроксен", "M01AE02"),
      ]).message,
    ).toContain("exact INN/composition не визначено");

    const wrongIndication = resolveEvidenceComparison(
      [cases[0].left, cases[0].right],
      "venous-thromboembolism",
    );
    expect(wrongIndication.status).toBe("insufficient");
    expect(wrongIndication.directness).toBe("insufficient");
  });

  it("does not match by brand, instruction-derived activeIngredient, dose or form", () => {
    const fakeBrandMatch = {
      ...product("31", "ЕЛІКВІС", "метформін", "A10BA02"),
      activeIngredient: "апіксабан",
      strength: "5 мг",
      dosageForm: "розчин",
    };
    const result = resolveEvidenceComparison([fakeBrandMatch, cases[0].right]);
    expect(result.status).toBe("insufficient");
    expect(result.comparison).toBeNull();
  });

  it("keeps sources, reviewed scope and calibrated uncertainty", () => {
    for (const comparison of EVIDENCE_REGISTRY) {
      expect(comparison.reviewedAt).toBe(EVIDENCE_REVIEWED_AT);
      expect(comparison.sources.length).toBeGreaterThanOrEqual(3);
      expect(
        comparison.sources.every((source) => /^https:\/\//u.test(source.url)),
      ).toBe(true);
      expect(comparison.insufficientData.toLocaleLowerCase("uk-UA")).toContain(
        "недостатньо даних",
      );
      expect(comparison.neutralConclusion).not.toMatch(
        /однозначно кращ|завжди кращ/iu,
      );
    }
  });

  it("keeps the generator index synchronized with the generic evidence registry", () => {
    expect(evidenceRegistryIndex.records).toEqual(
      EVIDENCE_REGISTRY.map((record) => ({
        id: record.id,
        comparatorInnKeys: record.comparators.map(
          (comparator) => comparator.exactInnAliases[0],
        ),
        indicationIds: [record.indication.id],
      })),
    );
  });
});
