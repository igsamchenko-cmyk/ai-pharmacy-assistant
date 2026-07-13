import type { VerifiedInteractionRule } from "./model";

export interface InteractionSourcePolicy {
  allowedSourceKeys: ReadonlySet<string>;
  requireReviewedAt: boolean;
  requireVersionOrDate: boolean;
}

export const DEFAULT_INTERACTION_SOURCE_POLICY: InteractionSourcePolicy = {
  allowedSourceKeys: new Set([
    "official-product-information",
    "official-regulatory-interaction-source",
    "project-reviewed-interactions",
  ]),
  requireReviewedAt: true,
  requireVersionOrDate: true,
};

export interface InteractionEligibility {
  eligible: boolean;
  reasons: string[];
}

export function evaluateInteractionRuleEligibility(
  rule: VerifiedInteractionRule,
  policy: InteractionSourcePolicy = DEFAULT_INTERACTION_SOURCE_POLICY,
): InteractionEligibility {
  const reasons: string[] = [];
  if (rule.reviewStatus !== "approved") reasons.push("not_approved");
  if (rule.unresolvedConflict) reasons.push("unresolved_conflict");
  if (rule.directionality !== "symmetric") {
    reasons.push("unsupported_directionality");
  }
  if (!policy.allowedSourceKeys.has(rule.source.key)) {
    reasons.push("source_not_allowed");
  }
  if (!rule.source.url && !rule.source.documentReference) {
    reasons.push("source_reference_missing");
  }
  if (
    policy.requireVersionOrDate &&
    !rule.source.version &&
    !rule.source.publishedAt
  ) {
    reasons.push("source_version_missing");
  }
  if (policy.requireReviewedAt && !rule.reviewedAt) {
    reasons.push("review_date_missing");
  }
  return { eligible: reasons.length === 0, reasons };
}
