/**
 * Review workflow for imported rows.
 *
 * Import never blindly trusts an external row. Every parsed row is assigned a
 * review status derived from its confidence, how the name is used, and whether
 * it collides with existing knowledge. The one hard rule: suspicious rows are
 * never auto-approved. Only clean, high-confidence rows reach `approved`;
 * everything else waits for a human (`pending` / `needs_review`) or is refused
 * (`rejected`).
 */
import type { ImportRow, ReviewStatus } from "./format";

export interface ReviewSignals {
  /** Row references an unknown/unregistered source. */
  unknownSource?: boolean;
  /** Row collides with existing/other knowledge (hard conflict). */
  hasConflict?: boolean;
}

/**
 * Derive a review status for a single row. Ordering matters:
 *  1. unknown source        → rejected (cannot be trusted at all)
 *  2. hard conflict         → needs_review (human must resolve)
 *  3. typo name_type        → needs_review (typos are always audited)
 *  4. low confidence        → needs_review
 *  5. verified/high (clean) → approved
 *  6. medium (clean)        → pending
 */
export function deriveReviewStatus(
  row: ImportRow,
  signals: ReviewSignals = {},
): ReviewStatus {
  if (signals.unknownSource) return "rejected";
  if (signals.hasConflict) return "needs_review";
  if (row.nameType === "typo") return "needs_review";
  if (row.confidence === "low") return "needs_review";
  if (row.confidence === "verified" || row.confidence === "high") {
    return "approved";
  }
  return "pending";
}

/** True when a status represents a row safe to load without human review. */
export function isAutoApprovable(status: ReviewStatus): boolean {
  return status === "approved";
}

export type ReviewDistribution = Record<ReviewStatus, number>;

export function emptyReviewDistribution(): ReviewDistribution {
  return { pending: 0, approved: 0, rejected: 0, needs_review: 0 };
}
