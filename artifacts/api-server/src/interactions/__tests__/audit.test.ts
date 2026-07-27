import { describe, expect, it } from "vitest";
import {
  buildInteractionFoundationAudit,
  migrateLegacyInteractionRules,
} from "../audit";

describe("legacy interaction foundation migration", () => {
  it("migrates every legacy rule without duplicate unordered pairs", () => {
    const rules = migrateLegacyInteractionRules();
    expect(rules).toHaveLength(287);
    expect(new Set(rules.map((rule) => rule.pairKey)).size).toBe(rules.length);
  });

  it("does not auto-approve legacy medical content", () => {
    const rules = migrateLegacyInteractionRules();
    expect(rules.every((rule) => rule.reviewStatus === "needs_review")).toBe(
      true,
    );
    expect(rules.every((rule) => rule.reviewedAt === null)).toBe(true);
  });

  it("reports the current provenance gaps deterministically", () => {
    const report = buildInteractionFoundationAudit();
    expect(report.datasetVersion).toBe("interaction-registry-v1.3.0");
    expect(report.totalRules).toBe(309);
    expect(report.uniquePairCount).toBe(309);
    expect(report.runtimeEligibleCount).toBe(22);
    expect(report.duplicatePairKeys).toEqual([]);
    expect(report.unresolvedConflicts).toBe(0);
    expect(report.statusCounts.approved).toBe(22);
    expect(report.statusCounts.needs_review).toBe(287);
    expect(report.provenanceCoverage.mechanism).toBe(93);
    expect(report.directionalityCounts.symmetric).toBe(309);
    expect(report.therapeuticGroupCoverage.classifiedRules).toBe(22);
    expect(report.therapeuticGroupCoverage.unclassifiedRules).toBe(287);
    expect(report.provenanceCoverage.sourceVersionOrDate).toBe(22);
    expect(report.provenanceCoverage.reviewedAt).toBe(22);
    expect(report.eligibilityBlockers.not_approved).toBe(287);
  });

  it("contains no secret or filesystem data in the audit", () => {
    const serialized = JSON.stringify(buildInteractionFoundationAudit());
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
