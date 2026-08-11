import type { RegistryRawRow } from "../ingestion";
import type {
  NationalListEntry,
  NationalListMatchStatus,
} from "../nationalList";
import { resolveNationalListMatch } from "../nationalList";
import {
  hasSpecificInstructionInn,
  instructionSourceFromRegistryRow,
} from "./expansion";
import type {
  DrugInstructionSnapshot,
  InstructionSourceProduct,
} from "./model";
import { hasStructuredOfficialInstructionSource } from "./source";

export const DEFAULT_INSTRUCTION_QUEUE_TARGET = 2_000;

export type InstructionFetchPriorityReason =
  | "parenteral"
  | "national_list"
  | "registry_remainder";

export type InstructionFetchQueueStatus =
  | "pending"
  | "fetching"
  | "fetched"
  | "parse_failed"
  | "source_changed";

export interface InstructionQueueRegistryMetadata {
  sourceUrl: string;
  sha256: string;
  checkedAt: string;
}

export interface InstructionFetchQueueCandidate {
  source: InstructionSourceProduct;
  priorityTier: 1 | 2 | 3;
  priorityReason: InstructionFetchPriorityReason;
  nationalListStatus: NationalListMatchStatus;
  status: "pending" | "fetched";
  fetchedDocumentHash: string | null;
}

export interface InstructionFetchQueuePlan {
  version: "1.0-instruction-fetch-queue";
  targetCount: number;
  registry: InstructionQueueRegistryMetadata;
  summary: {
    registryRowCount: number;
    eligibleQueueCount: number;
    eligibleDistinctInnCount: number;
    existingSnapshotCount: number;
    existingCurrentSnapshotCount: number;
    pendingCount: number;
    remainingToTarget: number;
    targetReachable: boolean;
    parenteralEligibleCount: number;
    parenteralFetchedCount: number;
    parenteralCoveragePct: number;
    nationalListEligibleCount: number;
    nationalListFetchedCount: number;
    nationalListCoveragePct: number;
    rejectedNonStructuredSourceCount: number;
    rejectedNonSpecificInnCount: number;
    rejectedInvalidMetadataCount: number;
    rejectedDuplicateRegistrationCount: number;
  };
  invalidMetadataFieldCounts: Record<string, number>;
  candidates: InstructionFetchQueueCandidate[];
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[ʼ’'`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function exactKey(
  registryProductId: string,
  registrationNumber: string,
): string {
  return `${registryProductId}\u0000${registrationNumber}`;
}

export function isParenteralDosageForm(value: string): boolean {
  const key = normalized(value);
  return [
    /(?:ін[єе]кц|інфуз)/u,
    /парентерал/u,
    /внутрішньо(?:вен|м яз|артері)/u,
    /підшкір/u,
    /інтратекал/u,
    /епідурал/u,
  ].some((pattern) => pattern.test(key));
}

function roundCoverage(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function queueSort(
  left: InstructionFetchQueueCandidate,
  right: InstructionFetchQueueCandidate,
): number {
  return (
    left.priorityTier - right.priorityTier ||
    left.source.tradeName.localeCompare(right.source.tradeName, "uk-UA") ||
    left.source.registrationNumber.localeCompare(
      right.source.registrationNumber,
      "uk-UA",
    ) ||
    left.source.registryProductId.localeCompare(right.source.registryProductId)
  );
}

function nationalListStatus(
  source: InstructionSourceProduct,
  entries: readonly NationalListEntry[],
): NationalListMatchStatus {
  if (!entries.length) return "not_applicable";
  return resolveNationalListMatch(
    {
      registryId: source.registryProductId,
      inn: source.inn,
      activeIngredient: source.activeIngredient,
      dosageForm: source.dosageForm,
      strength: source.strength,
    },
    entries,
    { activeRelease: true },
  ).status;
}

function priorityFor(
  source: InstructionSourceProduct,
  listStatus: NationalListMatchStatus,
): Pick<InstructionFetchQueueCandidate, "priorityTier" | "priorityReason"> {
  if (isParenteralDosageForm(source.dosageForm)) {
    return { priorityTier: 1, priorityReason: "parenteral" };
  }
  if (listStatus === "exact" || listStatus === "ingredient_only") {
    return { priorityTier: 2, priorityReason: "national_list" };
  }
  return { priorityTier: 3, priorityReason: "registry_remainder" };
}

export function buildInstructionFetchQueuePlan(
  rows: readonly RegistryRawRow[],
  existingSnapshots: readonly DrugInstructionSnapshot[],
  nationalListEntries: readonly NationalListEntry[],
  registry: InstructionQueueRegistryMetadata,
  targetCount = DEFAULT_INSTRUCTION_QUEUE_TARGET,
): InstructionFetchQueuePlan {
  if (
    !Number.isInteger(targetCount) ||
    targetCount < 1 ||
    targetCount > 2_500
  ) {
    throw new Error("instruction_queue_target_invalid");
  }

  const snapshotByExactKey = new Map(
    existingSnapshots.map((snapshot) => [
      exactKey(snapshot.registryProductId, snapshot.registrationNumber),
      snapshot,
    ]),
  );
  const invalidMetadataFieldCounts: Record<string, number> = {};
  const candidates: InstructionFetchQueueCandidate[] = [];
  const usedRegistrationNumbers = new Set<string>();
  let rejectedNonStructuredSourceCount = 0;
  let rejectedNonSpecificInnCount = 0;
  let rejectedInvalidMetadataCount = 0;
  let rejectedDuplicateRegistrationCount = 0;

  const orderedRows = [...rows].sort((left, right) => {
    const registrationOrder = left.registrationNumber.localeCompare(
      right.registrationNumber,
      "uk-UA",
    );
    if (registrationOrder) return registrationOrder;
    const leftRetained = snapshotByExactKey.has(
      exactKey(left.registryId, left.registrationNumber),
    );
    const rightRetained = snapshotByExactKey.has(
      exactKey(right.registryId, right.registrationNumber),
    );
    return (
      Number(rightRetained) - Number(leftRetained) ||
      left.registryId.localeCompare(right.registryId)
    );
  });
  for (const row of orderedRows) {
    if (
      !hasStructuredOfficialInstructionSource(
        row.instructionUrl,
        row.registrationNumber,
      )
    ) {
      rejectedNonStructuredSourceCount += 1;
      continue;
    }
    if (!hasSpecificInstructionInn(row)) {
      rejectedNonSpecificInnCount += 1;
      continue;
    }
    const source = instructionSourceFromRegistryRow(
      row,
      invalidMetadataFieldCounts,
    );
    if (!source) {
      rejectedInvalidMetadataCount += 1;
      continue;
    }
    if (usedRegistrationNumbers.has(source.registrationNumber)) {
      rejectedDuplicateRegistrationCount += 1;
      continue;
    }
    usedRegistrationNumbers.add(source.registrationNumber);
    const listStatus = nationalListStatus(source, nationalListEntries);
    const existing = snapshotByExactKey.get(
      exactKey(source.registryProductId, source.registrationNumber),
    );
    candidates.push({
      source,
      ...priorityFor(source, listStatus),
      nationalListStatus: listStatus,
      status: existing ? "fetched" : "pending",
      fetchedDocumentHash: existing?.source.documentHash ?? null,
    });
  }
  candidates.sort(queueSort);

  const fetched = candidates.filter(
    (candidate) => candidate.status === "fetched",
  );
  const parenteral = candidates.filter(
    (candidate) => candidate.priorityReason === "parenteral",
  );
  const listed = candidates.filter(
    (candidate) =>
      candidate.nationalListStatus === "exact" ||
      candidate.nationalListStatus === "ingredient_only",
  );
  const existingSnapshotCount = existingSnapshots.filter(
    (snapshot) =>
      snapshot.status === "available" || snapshot.status === "partial",
  ).length;
  const remainingToTarget = Math.max(0, targetCount - existingSnapshotCount);

  return {
    version: "1.0-instruction-fetch-queue",
    targetCount,
    registry,
    summary: {
      registryRowCount: rows.length,
      eligibleQueueCount: candidates.length,
      eligibleDistinctInnCount: new Set(
        candidates.map((candidate) => normalized(candidate.source.inn)),
      ).size,
      existingSnapshotCount,
      existingCurrentSnapshotCount: fetched.length,
      pendingCount: candidates.length - fetched.length,
      remainingToTarget,
      targetReachable:
        existingSnapshotCount + (candidates.length - fetched.length) >=
        targetCount,
      parenteralEligibleCount: parenteral.length,
      parenteralFetchedCount: parenteral.filter(
        (candidate) => candidate.status === "fetched",
      ).length,
      parenteralCoveragePct: roundCoverage(
        parenteral.filter((candidate) => candidate.status === "fetched").length,
        parenteral.length,
      ),
      nationalListEligibleCount: listed.length,
      nationalListFetchedCount: listed.filter(
        (candidate) => candidate.status === "fetched",
      ).length,
      nationalListCoveragePct: roundCoverage(
        listed.filter((candidate) => candidate.status === "fetched").length,
        listed.length,
      ),
      rejectedNonStructuredSourceCount,
      rejectedNonSpecificInnCount,
      rejectedInvalidMetadataCount,
      rejectedDuplicateRegistrationCount,
    },
    invalidMetadataFieldCounts,
    candidates,
  };
}

export interface InstructionFetchFailureTransition {
  status: "pending" | "parse_failed";
  nextAttemptAt: Date | null;
}

export function instructionFetchFailureTransition(input: {
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
  now: Date;
}): InstructionFetchFailureTransition {
  if (!input.retryable || input.attempts >= input.maxAttempts) {
    return { status: "parse_failed", nextAttemptAt: null };
  }
  const delaysMs = [60_000, 5 * 60_000, 30 * 60_000];
  const delay =
    delaysMs[Math.min(Math.max(input.attempts - 1, 0), 2)] ?? delaysMs[2];
  return {
    status: "pending",
    nextAttemptAt: new Date(input.now.getTime() + delay),
  };
}
