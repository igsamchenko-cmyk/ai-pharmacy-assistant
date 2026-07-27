import { describe, expect, it } from "vitest";
import type {
  RegistryInteractionFindingSeverity,
  RegistryInteractionPair,
  RegistryInteractionResult,
} from "@workspace/api-client-react";
import {
  buildInteractionResultSummary,
  sortInteractionPairsByRisk,
} from "./interaction-result-summary";

function pair(
  status: RegistryInteractionPair["status"],
  severity: RegistryInteractionFindingSeverity = "unknown",
): RegistryInteractionPair {
  return {
    productAId: "A".repeat(32),
    productAName: "Препарат A",
    productBId: "B".repeat(32),
    productBName: "Препарат B",
    status,
    message: "Результат перевірки",
    findings:
      status === "verified_interaction"
        ? [
            {
              ingredientA: "Ingredient A",
              ingredientB: "Ingredient B",
              severity,
              clinicalEffect: "Клінічний ефект",
              mechanism: null,
              explanation: "Пояснення",
              actionCategory: "monitor",
              evidenceLevel: "established",
              source: {
                label: "Official source",
                url: "https://example.test/source",
                documentReference: "Section 4.5",
                version: "1",
                publishedAt: "2026-01-01",
                accessedAt: "2026-01-02",
                reviewedAt: "2026-01-03",
              },
            },
          ]
        : [],
    duplicateIngredients: status === "same_ingredient" ? ["Ingredient A"] : [],
  };
}

function result(
  pairs: RegistryInteractionPair[],
  unresolvedIngredientCount = 0,
): Pick<RegistryInteractionResult, "pairs" | "coverage"> {
  return {
    pairs,
    coverage: {
      selectedCount: 2,
      resolvedIngredientCount: 2,
      unresolvedIngredientCount,
      evaluatedIngredientPairs: 1,
      matchedApprovedPairs: pairs.filter(
        (item) => item.status === "verified_interaction",
      ).length,
      status: unresolvedIngredientCount ? "partial" : "complete",
      totalRules: 294,
      runtimeEligibleRules: 7,
      datasetVersion: "verified-interactions-v1.0.0",
    },
  };
}

describe("interaction result safety summary", () => {
  it("summarizes the highest verified risk without hiding uncovered pairs", () => {
    const summary = buildInteractionResultSummary(
      result([
        pair("insufficient_evidence"),
        pair("verified_interaction", "major"),
        pair("verified_interaction", "contraindicated"),
      ]),
    );

    expect(summary).toMatchObject({
      state: "contraindicated",
      pairCount: 3,
      verifiedPairCount: 2,
      insufficientPairCount: 1,
      highestSeverity: "contraindicated",
    });
  });

  it("fails closed when no verified rule exists", () => {
    const summary = buildInteractionResultSummary(
      result([pair("insufficient_evidence")]),
    );

    expect(summary.state).toBe("insufficient");
    expect(summary.title).toContain("Надійного висновку");
    expect(summary.message).toContain("не означає, що поєднання безпечне");
  });

  it("reports unresolved composition before making a compatibility claim", () => {
    const summary = buildInteractionResultSummary(
      result([pair("incomplete_composition")], 1),
    );

    expect(summary.state).toBe("incomplete");
    expect(summary.incompletePairCount).toBe(1);
    expect(summary.message).toContain("Не використовуйте");
  });

  it("surfaces duplicate ingredients before an insufficient-evidence state", () => {
    const summary = buildInteractionResultSummary(
      result([pair("same_ingredient"), pair("insufficient_evidence")]),
    );

    expect(summary.state).toBe("duplicate");
    expect(summary.duplicatePairCount).toBe(1);
  });

  it("sorts verified high-risk findings ahead of uncovered pairs", () => {
    const sorted = sortInteractionPairsByRisk([
      pair("insufficient_evidence"),
      pair("verified_interaction", "moderate"),
      pair("verified_interaction", "contraindicated"),
      pair("same_ingredient"),
    ]);

    expect(
      sorted.map((item) => [item.status, item.findings[0]?.severity]),
    ).toEqual([
      ["verified_interaction", "contraindicated"],
      ["verified_interaction", "moderate"],
      ["same_ingredient", undefined],
      ["insufficient_evidence", undefined],
    ]);
  });
});
