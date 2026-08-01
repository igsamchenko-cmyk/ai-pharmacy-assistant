import { describe, expect, it } from "vitest";
import type { IngredientSeed } from "../../knowledge/dictionary/ingredients";
import type { DrugInstructionSnapshot } from "../../knowledge/instructions/model";
import {
  buildInteractionCandidatePipelineReport,
  detectInteractionTriageSignal,
} from "../candidatePipeline";
import {
  normalizedInteractionPairKey,
  type VerifiedInteractionRule,
} from "../model";

const ingredients: IngredientSeed[] = [
  {
    inn: "Варфарин",
    latin: "Warfarinum",
    english: "Warfarin",
    atc: "B01AA03",
    group: "Антикоагулянти",
    brands: ["Варфарин"],
  },
  {
    inn: "Ібупрофен",
    latin: "Ibuprofenum",
    english: "Ibuprofen",
    atc: "M01AE01",
    group: "НПЗЗ",
    brands: ["Нурофєн"],
  },
];

function snapshot(
  id: string,
  interactions: string | null,
  overrides: Partial<DrugInstructionSnapshot> = {},
): DrugInstructionSnapshot {
  return {
    version: "1.0",
    registryProductId: id.repeat(32).slice(0, 32),
    registrationNumber: `UA/1234/01/0${id}`,
    tradeName: `ТЕСТ ${id}`,
    inn: "Warfarin",
    activeIngredient: "Warfarin 5 mg",
    dosageForm: "таблетки",
    strength: "5 mg",
    manufacturer: "Test",
    manufacturerCountry: "Україна",
    registrationStartDate: "01.01.2026",
    registrationEndDate: "необмежений",
    status: "available",
    sections: {
      indications: null,
      contraindications: null,
      adverseReactions: null,
      interactions,
      specialWarnings: null,
      pregnancyAndLactation: null,
      administration: null,
      overdose: null,
      storage: null,
    },
    source: {
      url: `https://www.drlz.com.ua/ibp/lz_www.nsf/id/${id.repeat(32).slice(0, 32)}/$file/UA1234010${id}_ABCD.mht`,
      documentId: id.repeat(32).slice(0, 32),
      documentDate: "2026-07-01T00:00:00.000Z",
      checkedAt: "2026-07-02T00:00:00.000Z",
      documentHash: id.repeat(64).slice(0, 64).toLowerCase(),
      contentLength: 1_000,
      parserVersion: "ua-drlz-mht-v1",
      datasetTitle: "Official registry",
      datasetUrl: "https://data.gov.ua/dataset/test",
      license: "CC BY 4.0",
    },
    provenance: {
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 1,
      coveragePct: 11,
    },
    warnings: [],
    ...overrides,
  };
}

function verifiedRule(): VerifiedInteractionRule {
  return {
    id: "verified-warfarin-ibuprofen-test",
    ingredientA: "Warfarin",
    ingredientB: "Ibuprofen",
    pairKey: normalizedInteractionPairKey("Warfarin", "Ibuprofen"),
    directionality: "symmetric",
    therapeuticGroupsA: ["Anticoagulants"],
    therapeuticGroupsB: ["NSAIDs"],
    severity: "major",
    clinicalEffect: "Bleeding risk.",
    mechanism: null,
    explanation: "Official product information supports the exact pair.",
    actionCategory: "monitor",
    evidenceLevel: "established",
    source: {
      key: "official-product-information",
      label: "Official label",
      url: "https://example.org/official-label",
      documentReference: "Interaction section",
      version: "2026-07",
      publishedAt: "2026-07-01",
      accessedAt: "2026-07-02",
    },
    reviewStatus: "approved",
    reviewedAt: "2026-07-02",
    unresolvedConflict: false,
    provenance: {
      datasetVersion: "test-v1",
      importedAt: null,
      origin: "curated",
      sourceRecordId: "verified-warfarin-ibuprofen-test",
    },
    populationContext: null,
  };
}

describe("interaction candidate pipeline", () => {
  it("deduplicates the same INN claim across official product instructions", () => {
    const text =
      "Одночасне застосування з ібупрофеном не рекомендується через ризик кровотечі.";
    const report = buildInteractionCandidatePipelineReport({
      snapshots: [snapshot("A", text), snapshot("B", text)],
      ingredientSeeds: ingredients,
      verifiedRules: [],
      classSeeds: [],
    });

    expect(report.counts).toMatchObject({
      instructionDocuments: 2,
      resolvedSubjectDocuments: 2,
      rawEvidenceRecords: 2,
      uniqueCandidates: 1,
      needsReviewCandidates: 1,
    });
    expect(report.candidates[0]).toMatchObject({
      reviewStatus: "needs_review",
      triageSignal: "avoidance_language",
      supportingDocumentCount: 2,
      supportingProductCount: 2,
    });
    expect(report.candidates[0]?.evidence).toHaveLength(2);
    expect(report.safety).toEqual({
      candidatesOnly: true,
      automaticApproval: false,
      runtimeRulesChanged: false,
      partialCompositionRuntimeEligible: false,
      classMembershipInference: false,
      missingEvidenceMeansCompatible: false,
    });
  });

  it("keeps evidence for an already verified pair out of the review queue", () => {
    const report = buildInteractionCandidatePipelineReport({
      snapshots: [
        snapshot(
          "C",
          "При застосуванні з Ibuprofenum необхідно контролювати ознаки кровотечі.",
        ),
      ],
      ingredientSeeds: ingredients,
      verifiedRules: [verifiedRule()],
      classSeeds: [],
    });

    expect(report.candidates[0]?.reviewStatus).toBe("already_verified");
    expect(report.counts.alreadyVerifiedCandidates).toBe(1);
    expect(report.reviewQueue).toEqual([]);
  });

  it("creates class-scoped candidates without expanding class membership", () => {
    const report = buildInteractionCandidatePipelineReport({
      snapshots: [
        snapshot(
          "D",
          "Слід уникати одночасного застосування з нестероїдними протизапальними засобами.",
        ),
      ],
      ingredientSeeds: ingredients,
      verifiedRules: [],
    });

    expect(report.counts.ingredientToClassCandidates).toBe(1);
    expect(report.candidates[0]?.left.kind).toBe("therapeutic_class");
    expect(report.candidates[0]?.right).toMatchObject({
      kind: "ingredient",
      canonicalName: "Warfarin",
    });
    expect(report.safety.classMembershipInference).toBe(false);
  });

  it("uses an atomic official INN as candidate vocabulary only", () => {
    const report = buildInteractionCandidatePipelineReport({
      snapshots: [
        snapshot("G", "Ibuprofen потребує контролю.", {
          inn: "Paroxetine",
          activeIngredient: "Paroxetine 20 mg",
        }),
      ],
      ingredientSeeds: ingredients,
      verifiedRules: [],
      classSeeds: [],
    });

    expect(report.counts.resolvedSubjectDocuments).toBe(1);
    expect(report.counts.officialInnFallbackDocuments).toBe(1);
    expect(report.counts.unresolvedSubjectDocuments).toBe(0);
    expect(report.candidates[0]?.left).toMatchObject({
      canonicalName: "Ibuprofen",
      vocabularyStatus: "canonical_dictionary",
    });
    expect(report.candidates[0]?.right).toMatchObject({
      canonicalName: "Paroxetine",
      vocabularyStatus: "official_inn_candidate",
    });
    expect(report.safety.automaticApproval).toBe(false);
  });

  it("fails closed for unresolved subjects and rejected provenance", () => {
    const unresolved = snapshot("E", "Ібупрофен потребує контролю.", {
      inn: "Unknown substance + Other",
      activeIngredient: "Unknown substance + Other",
    });
    const rejected = snapshot("F", "Ібупрофен потребує контролю.", {
      provenance: {
        sourceAllowed: false,
        registrationMatched: true,
        contentLocationMatched: true,
        availableSectionCount: 1,
        coveragePct: 11,
      },
    });
    const report = buildInteractionCandidatePipelineReport({
      snapshots: [unresolved, rejected],
      ingredientSeeds: ingredients,
      verifiedRules: [],
      classSeeds: [],
    });

    expect(report.counts.eligibleInstructionDocuments).toBe(1);
    expect(report.counts.unresolvedSubjectDocuments).toBe(1);
    expect(report.counts.uniqueCandidates).toBe(0);
    expect(report.unresolvedSubjects[0]?.inn).toBe("Unknown substance + Other");
  });

  it("uses language signals only for triage, never for automatic approval", () => {
    expect(detectInteractionTriageSignal("Комбінація протипоказана.")).toBe(
      "contraindication_language",
    );
    expect(detectInteractionTriageSignal("Потрібна корекція дози.")).toBe(
      "dose_adjustment_language",
    );
    expect(
      detectInteractionTriageSignal("Згадується у розділі взаємодій."),
    ).toBe("unspecified");
  });

  it("is deterministic for identical snapshots", () => {
    const input = {
      snapshots: [snapshot("1", "Ібупрофен слід застосовувати з обережністю.")],
      ingredientSeeds: ingredients,
      verifiedRules: [],
      classSeeds: [],
    };

    expect(buildInteractionCandidatePipelineReport(input)).toEqual(
      buildInteractionCandidatePipelineReport(input),
    );
  });
});
