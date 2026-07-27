import { describe, expect, it } from "vitest";
import { interactionRules } from "../../data/interactions";
import { ingredientSeeds } from "../../knowledge/dictionary/ingredients";
import {
  buildInteractionEvidenceCoverageReport,
  createInteractionCoverageResolver,
  extractObservedRegistryRowsByInn,
  type InteractionCoverageInput,
} from "../coverageReport";
import { verifiedInteractionRules } from "../verifiedRules";

const catalogSnapshot = {
  sourceSha256:
    "228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96",
  registryRows: 16_533,
  uniqueNormalizedInnExpressions: 1_638,
};

function input(
  overrides: Partial<InteractionCoverageInput> = {},
): InteractionCoverageInput {
  return {
    ingredientSeeds,
    verifiedRules: verifiedInteractionRules,
    legacyRules: interactionRules,
    catalogSnapshot,
    ...overrides,
  };
}

describe("interaction evidence coverage report", () => {
  it("accounts for the complete bounded canonical-INN pair space", () => {
    const report = buildInteractionEvidenceCoverageReport(input());

    expect(report.catalog).toEqual({
      ...catalogSnapshot,
      canonicalInnCount: 136,
      therapeuticClassCount: 85,
    });
    expect(report.counts.potentialExactPairs).toBe(9_180);
    expect(
      report.counts.verifiedPairs +
        report.counts.needsReviewPairs +
        report.counts.unsupportedPairs,
    ).toBe(report.counts.potentialExactPairs);
    expect(report.counts.verifiedPairs).toBe(19);
    expect(report.counts.legacyRules).toBe(287);
    expect(report.ingredientCoverage).toHaveLength(136);
    expect(
      report.ingredientCoverage.every(
        (ingredient) =>
          ingredient.verifiedPairCount +
            ingredient.needsReviewPairCount +
            ingredient.unsupportedPairCount ===
          ingredient.potentialPartnerCount,
      ),
    ).toBe(true);
    expect(
      report.ingredientCoverage.reduce(
        (total, ingredient) => total + ingredient.verifiedPairCount,
        0,
      ),
    ).toBe(report.counts.verifiedPairs * 2);
  });

  it("classifies exact pairs without brand or class inference", () => {
    const resolver = createInteractionCoverageResolver(input());

    expect(resolver.resolvePair("Апіксабан", "Ібупрофен")).toMatchObject({
      status: "verified",
      reason: "approved_exact_pair",
      ingredientA: "Apixaban",
      ingredientB: "Ibuprofen",
    });
    expect(resolver.resolvePair("Варфарин", "Німесулід")).toMatchObject({
      status: "needs_review",
      reason: "legacy_exact_pair_pending_review",
      ingredientA: "Warfarin",
      ingredientB: "Nimesulide",
    });
    expect(resolver.resolvePair("Paracetamol", "Omeprazole")).toMatchObject({
      status: "unsupported",
      reason: "no_exact_pair_evidence",
    });
    expect(resolver.resolvePair("Еліквіс", "Ibuprofen")).toMatchObject({
      status: "unsupported",
      reason: "ingredient_not_in_catalog",
    });
  });

  it("fails closed for unknown and same-ingredient requests", () => {
    const resolver = createInteractionCoverageResolver(input());

    expect(
      resolver.resolvePair("Unknown ingredient", "Ibuprofen"),
    ).toMatchObject({
      status: "unsupported",
      reason: "ingredient_not_in_catalog",
    });
    expect(resolver.resolvePair("Ібупрофен", "Ibuprofen")).toMatchObject({
      status: "unsupported",
      reason: "same_ingredient",
    });
  });

  it("builds a deterministic bounded needs-review priority queue", () => {
    const frequency = new Map([
      ["Warfarin", 15],
      ["Nimesulide", 44],
      ["Ibuprofen", 80],
    ]);
    const report = buildInteractionEvidenceCoverageReport(
      input({ observedRegistryRowsByInn: frequency }),
    );

    expect(report.priorityQueue).toHaveLength(25);
    expect(new Set(report.priorityQueue.map((item) => item.pairKey)).size).toBe(
      25,
    );
    expect(
      report.priorityQueue.every((item) => item.status === "needs_review"),
    ).toBe(true);
    expect(report.priorityQueue.map((item) => item.rank)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(
      report.priorityQueue.every(
        (item, index, values) =>
          index === 0 || values[index - 1]!.priorityScore >= item.priorityScore,
      ),
    ).toBe(true);
    expect(report.priorityPolicy.noAutomaticApproval).toBe(true);
  });

  it("uses observed registry counts only when explicitly present", () => {
    const frequency = extractObservedRegistryRowsByInn(
      {
        cases: [
          {
            registryPresence: { sampleInn: ["Apixaban"] },
            provenance: { registryTargetCount: 20 },
          },
          {
            registryPresence: { sampleInn: ["Apixaban"] },
            provenance: { registryTargetCount: 6 },
          },
          {
            registryPresence: { sampleInn: ["Unknown"] },
            provenance: { registryTargetCount: 999 },
          },
        ],
      },
      ingredientSeeds,
    );

    expect(frequency.get("Apixaban")).toBe(20);
    expect(frequency.has("Unknown")).toBe(false);
  });

  it("does not turn missing evidence into a no-interaction claim", () => {
    const report = buildInteractionEvidenceCoverageReport(input());

    expect(report.statusDefinitions.unsupported.clinicalConclusionAllowed).toBe(
      false,
    );
    expect(report.statusDefinitions.unsupported.meaning).toContain(
      "does not mean",
    );
    expect(
      report.statusDefinitions.needs_review.clinicalConclusionAllowed,
    ).toBe(false);
    expect(JSON.stringify(report)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(report)).not.toMatch(/[A-Z]:\\|\/home\//);
  });

  it("is reproducible for the same inputs", () => {
    const first = buildInteractionEvidenceCoverageReport(input());
    const second = buildInteractionEvidenceCoverageReport(input());

    expect(second).toEqual(first);
  });
});
