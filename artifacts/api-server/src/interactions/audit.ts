import { interactionRules, type RiskLevel } from "../data/interactions";
import { getSource } from "../knowledge/provenance";
import {
  normalizedInteractionPairKey,
  type InteractionActionCategory,
  type InteractionSeverity,
  type VerifiedInteractionRule,
} from "./model";
import { evaluateInteractionRuleEligibility } from "./policy";
import { verifiedInteractionRules } from "./verifiedRules";

const LEGACY_DATASET_VERSION = "legacy-static-v0.3";
const REGISTRY_DATASET_VERSION = "interaction-registry-v1.1.0";

function severityForRisk(riskLevel: RiskLevel): InteractionSeverity {
  switch (riskLevel) {
    case "critical":
    case "high":
      return "major";
    case "medium":
      return "moderate";
    case "low":
      return "minor";
  }
}

function actionForRisk(riskLevel: RiskLevel): InteractionActionCategory {
  switch (riskLevel) {
    case "critical":
      return "specialist_review";
    case "high":
      return "consider_alternative";
    case "medium":
      return "monitor";
    case "low":
      return "informational";
  }
}

/**
 * Lossless structural migration of the existing active rules into review
 * candidates. It deliberately does not auto-approve medical content: the
 * legacy source has no source version/date or recorded clinical review.
 */
export function migrateLegacyInteractionRules(): VerifiedInteractionRule[] {
  return interactionRules.map((legacy, index) => {
    const source = getSource(legacy.sourceKey ?? "pharmacology-reference");
    const pairKey = normalizedInteractionPairKey(legacy.a, legacy.b);
    return {
      id: `legacy-${String(index + 1).padStart(4, "0")}-${pairKey}`,
      ingredientA: legacy.a,
      ingredientB: legacy.b,
      pairKey,
      directionality: "symmetric",
      therapeuticGroupsA: [],
      therapeuticGroupsB: [],
      severity: severityForRisk(legacy.riskLevel),
      clinicalEffect: legacy.explanation,
      mechanism: legacy.mechanism ?? null,
      explanation: legacy.explanation,
      actionCategory: actionForRisk(legacy.riskLevel),
      evidenceLevel: legacy.evidence ?? "reference",
      source: {
        key: source?.key ?? legacy.sourceKey ?? "unknown",
        label: source?.label ?? "Unknown legacy source",
        url: source?.url ?? null,
        documentReference: null,
        version: null,
        publishedAt: null,
        accessedAt: null,
      },
      reviewStatus: "needs_review",
      reviewedAt: null,
      unresolvedConflict: false,
      provenance: {
        datasetVersion: LEGACY_DATASET_VERSION,
        importedAt: null,
        origin: legacy.origin ?? "curated",
        sourceRecordId: null,
      },
      populationContext: null,
    };
  });
}

export function buildInteractionRuleRegistry(): VerifiedInteractionRule[] {
  return [...verifiedInteractionRules, ...migrateLegacyInteractionRules()];
}

export interface InteractionFoundationAudit {
  datasetVersion: string;
  totalRules: number;
  uniquePairCount: number;
  runtimeEligibleCount: number;
  statusCounts: Record<string, number>;
  severityCounts: Record<string, number>;
  directionalityCounts: Record<string, number>;
  therapeuticGroupCoverage: {
    classifiedRules: number;
    unclassifiedRules: number;
  };
  sourceCounts: Record<string, number>;
  provenanceCoverage: {
    sourceReference: number;
    sourceVersionOrDate: number;
    reviewedAt: number;
    mechanism: number;
  };
  duplicatePairKeys: string[];
  unresolvedConflicts: number;
  eligibilityBlockers: Record<string, number>;
}

export function buildInteractionFoundationAudit(
  rules = buildInteractionRuleRegistry(),
): InteractionFoundationAudit {
  const pairCounts = new Map<string, number>();
  const statusCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  const directionalityCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const eligibilityBlockers: Record<string, number> = {};
  let runtimeEligibleCount = 0;
  let sourceReference = 0;
  let sourceVersionOrDate = 0;
  let reviewedAt = 0;
  let mechanism = 0;
  let unresolvedConflicts = 0;
  let classifiedRules = 0;

  for (const rule of rules) {
    pairCounts.set(rule.pairKey, (pairCounts.get(rule.pairKey) ?? 0) + 1);
    statusCounts[rule.reviewStatus] =
      (statusCounts[rule.reviewStatus] ?? 0) + 1;
    severityCounts[rule.severity] = (severityCounts[rule.severity] ?? 0) + 1;
    directionalityCounts[rule.directionality] =
      (directionalityCounts[rule.directionality] ?? 0) + 1;
    if (rule.therapeuticGroupsA.length || rule.therapeuticGroupsB.length) {
      classifiedRules += 1;
    }
    sourceCounts[rule.source.key] = (sourceCounts[rule.source.key] ?? 0) + 1;
    if (rule.source.url || rule.source.documentReference) sourceReference += 1;
    if (rule.source.version || rule.source.publishedAt)
      sourceVersionOrDate += 1;
    if (rule.reviewedAt) reviewedAt += 1;
    if (rule.mechanism) mechanism += 1;
    if (rule.unresolvedConflict) unresolvedConflicts += 1;

    const eligibility = evaluateInteractionRuleEligibility(rule);
    if (eligibility.eligible) runtimeEligibleCount += 1;
    for (const reason of eligibility.reasons) {
      eligibilityBlockers[reason] = (eligibilityBlockers[reason] ?? 0) + 1;
    }
  }

  return {
    datasetVersion: REGISTRY_DATASET_VERSION,
    totalRules: rules.length,
    uniquePairCount: pairCounts.size,
    runtimeEligibleCount,
    statusCounts,
    severityCounts,
    directionalityCounts,
    therapeuticGroupCoverage: {
      classifiedRules,
      unclassifiedRules: rules.length - classifiedRules,
    },
    sourceCounts,
    provenanceCoverage: {
      sourceReference,
      sourceVersionOrDate,
      reviewedAt,
      mechanism,
    },
    duplicatePairKeys: [...pairCounts]
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
      .sort(),
    unresolvedConflicts,
    eligibilityBlockers,
  };
}
