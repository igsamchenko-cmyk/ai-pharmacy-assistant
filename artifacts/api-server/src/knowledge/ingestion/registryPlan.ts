import { createHash } from "node:crypto";
import { normalize } from "../../lib/text";
import {
  liveKnowledgeView,
  type ImportPreview,
  type KnowledgeView,
} from "../import/analyze";
import type { ImportRow, ReviewStatus } from "../import/format";
import { emptyReviewDistribution, type ReviewDistribution } from "../import/review";
import {
  buildReviewableImportPlan,
  type ReviewableImportPlan,
  type ReviewableImportRow,
} from "./commit";
import type {
  RegistryMappingStats,
  RegistryParseResult,
} from "./registry";

export interface RegistryConflictSample {
  name: string;
  canonicalInn: string;
  registrationNumber: string | null;
  reviewStatus: ReviewStatus;
}

export interface RegistryConflictGroup {
  conflictGroupId: string;
  normalizedName: string;
  candidateType: string;
  ingredientIds: string[];
  registryProductCount: number;
  registrationNumbers: string[];
  reason: string;
  severity: "review" | "quarantine" | "blocker";
  recommendedStatus: ReviewStatus | "quarantined";
  sampleRecords: RegistryConflictSample[];
  totalAffectedRows: number;
}

export interface RegistryReviewDistribution extends ReviewDistribution {
  quarantined: number;
}

export interface RegistryMappingPlan {
  allCandidatesPlan: ReviewableImportPlan;
  approvedCandidatesPlan: ReviewableImportPlan;
  approvedCandidates: ImportRow[];
  approvedReviewableRows: ReviewableImportRow[];
  reviewOnlyRows: ReviewableImportRow[];
  quarantinedRows: ReviewableImportRow[];
  reviewDistribution: RegistryReviewDistribution;
  conflictGroups: RegistryConflictGroup[];
  topConflictGroups: RegistryConflictGroup[];
  approvedCandidateConflicts: number;
  reviewOnlyConflicts: number;
  quarantinedConflicts: number;
  duplicateCount: number;
  readiness: {
    productSnapshotReady: boolean;
    approvedMappingsReady: boolean;
    reviewQueueReady: boolean;
    DBCommitReady: boolean;
  };
  blocked: string[];
  stats: RegistryMappingStats;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function registrationNumberFromNotes(notes: string | undefined): string | null {
  const match = notes?.match(/(?:^|;\s*)registration:([^;]+)/i);
  return match?.[1]?.trim() || null;
}

function hardConflictTypes(preview: ImportPreview): number {
  return preview.conflicts.filter(
    (conflict) =>
      conflict.type === "name_multiple_ingredients" ||
      conflict.type === "brand_conflicting_inn",
  ).length;
}

function groupConflictRows(rows: readonly ReviewableImportRow[]): RegistryConflictGroup[] {
  const byName = new Map<string, ReviewableImportRow[]>();
  for (const item of rows) {
    const key = normalize(item.row.name);
    const existing = byName.get(key);
    if (existing) existing.push(item);
    else byName.set(key, [item]);
  }

  const groups: RegistryConflictGroup[] = [];
  for (const [normalizedName, items] of byName) {
    const hasConflictFlag = items.some((item) =>
      item.conflictFlags.includes("name_multiple_ingredients") ||
      item.conflictFlags.includes("brand_conflicting_inn"),
    );
    const ingredientIds = [
      ...new Set(items.map((item) => item.row.ingredientId).filter(Boolean)),
    ].sort();
    const canonicalInnKeys = [
      ...new Set(items.map((item) => normalize(item.row.canonicalInn))),
    ].sort();
    if (!hasConflictFlag && ingredientIds.length <= 1 && canonicalInnKeys.length <= 1) {
      continue;
    }

    const candidateType = [
      ...new Set(items.map((item) => item.row.nameType)),
    ].sort().join("+");
    const registrationNumbers = [
      ...new Set(
        items
          .map((item) => registrationNumberFromNotes(item.row.notes))
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort();
    const sampleRecords = items.slice(0, 5).map((item) => ({
      name: item.row.name,
      canonicalInn: item.row.canonicalInn,
      registrationNumber: registrationNumberFromNotes(item.row.notes),
      reviewStatus: item.reviewStatus,
    }));

    groups.push({
      conflictGroupId: stableHash(
        [normalizedName, candidateType, ingredientIds.join("|")].join("\u001f"),
      ),
      normalizedName,
      candidateType,
      ingredientIds,
      registryProductCount: registrationNumbers.length || items.length,
      registrationNumbers: registrationNumbers.slice(0, 20),
      reason:
        ingredientIds.length > 1 || canonicalInnKeys.length > 1
          ? "same_normalized_name_multiple_ingredient_ids"
          : "name_conflicts_with_existing_mapping",
      severity: "quarantine",
      recommendedStatus: "quarantined",
      sampleRecords,
      totalAffectedRows: items.length,
    });
  }

  return groups.sort((a, b) =>
    b.totalAffectedRows - a.totalAffectedRows ||
    a.normalizedName.localeCompare(b.normalizedName),
  );
}

export function buildRegistryMappingPlan(
  registry: RegistryParseResult,
  view: KnowledgeView = liveKnowledgeView(),
): RegistryMappingPlan {
  const allCandidatesPlan = buildReviewableImportPlan(registry.candidates, [], view);
  const conflictGroups = groupConflictRows(allCandidatesPlan.reviewable);
  const quarantinedNames = new Set(conflictGroups.map((group) => group.normalizedName));

  const reviewDistribution: RegistryReviewDistribution = {
    ...emptyReviewDistribution(),
    quarantined: 0,
  };
  const approvedCandidates: ImportRow[] = [];
  const approvedReviewableRows: ReviewableImportRow[] = [];
  const reviewOnlyRows: ReviewableImportRow[] = [];
  const quarantinedRows: ReviewableImportRow[] = [];

  for (const item of allCandidatesPlan.reviewable) {
    const isQuarantined = quarantinedNames.has(normalize(item.row.name));
    if (isQuarantined) {
      reviewDistribution.quarantined++;
      quarantinedRows.push(item);
      continue;
    }

    reviewDistribution[item.reviewStatus]++;
    if (item.reviewStatus === "approved") {
      approvedCandidates.push(item.row);
      approvedReviewableRows.push(item);
    } else {
      reviewOnlyRows.push(item);
    }
  }

  const approvedCandidatesPlan = buildReviewableImportPlan(approvedCandidates, [], view);
  const approvedCandidateConflicts = hardConflictTypes(approvedCandidatesPlan.preview);
  const productSnapshotReady =
    registry.parseErrors.length === 0 &&
    registry.rawRows === registry.parsedRows &&
    registry.rows.length === registry.parsedRows;
  const approvedMappingsReady =
    approvedCandidatesPlan.blocked.filter((blocker) => blocker !== "hard_conflicts").length === 0 &&
    approvedCandidateConflicts === 0;
  const reviewQueueReady =
    allCandidatesPlan.preview.copyrightViolations === 0 &&
    allCandidatesPlan.preview.missingSources === 0;
  const DBCommitReady = productSnapshotReady && approvedMappingsReady && reviewQueueReady;

  const blocked = [
    ...(productSnapshotReady ? [] : ["product_snapshot_not_ready"]),
    ...approvedCandidatesPlan.blocked.filter((blocker) => blocker !== "hard_conflicts"),
    ...(approvedCandidateConflicts > 0 ? ["approved_hard_conflicts"] : []),
  ];

  const stats: RegistryMappingStats = {
    reviewDistribution,
    autoApprovedSafe: approvedCandidates.length,
    duplicates: allCandidatesPlan.preview.duplicates,
    hardApprovedConflicts: approvedCandidateConflicts,
    reviewOnlyConflicts: conflictGroups.reduce(
      (sum, group) => sum + group.totalAffectedRows,
      0,
    ),
    productSnapshotReady,
    approvedMappingsReady,
    reviewQueueReady,
    DBCommitReady,
  };

  return {
    allCandidatesPlan,
    approvedCandidatesPlan,
    approvedCandidates,
    approvedReviewableRows,
    reviewOnlyRows,
    quarantinedRows,
    reviewDistribution,
    conflictGroups,
    topConflictGroups: conflictGroups.slice(0, 20),
    approvedCandidateConflicts,
    reviewOnlyConflicts: stats.reviewOnlyConflicts ?? 0,
    quarantinedConflicts: conflictGroups.length,
    duplicateCount: allCandidatesPlan.preview.duplicates,
    readiness: {
      productSnapshotReady,
      approvedMappingsReady,
      reviewQueueReady,
      DBCommitReady,
    },
    blocked,
    stats,
  };
}

export function summarizeImportPreview(preview: ImportPreview): Omit<ImportPreview, "conflicts"> & {
  conflicts: number;
} {
  return {
    ...preview,
    conflicts: preview.conflicts.length,
  };
}
