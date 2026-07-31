import {
  DLS_DOCUMENT_TYPE_IDS,
  mergeSeriesRestrictionSnapshots,
  seriesRestrictionRecordIdentity,
} from "./importer";
import {
  SERIES_RESTRICTION_EVENT_TYPES,
  type SeriesRestrictionEventType,
  type SeriesRestrictionRecord,
  type SeriesRestrictionSnapshot,
} from "./model";

export interface SeriesRestrictionChangePreview {
  changeKind: "added" | "updated";
  changedFields: string[];
  documentDate: string;
  documentNumber: string;
  eventType: SeriesRestrictionEventType;
  registrationNumber: string | null;
  medicineName: string;
  seriesRaw: string;
}

export interface SeriesRestrictionUpdateCheck {
  key:
    | "refresh_complete"
    | "refresh_without_warnings"
    | "refresh_has_records"
    | "refresh_overlap_continuity"
    | "history_preserved"
    | "latest_date_not_regressed"
    | "candidate_count_consistent"
    | "document_types_complete";
  passed: boolean;
  detail: string;
}

export interface SeriesRestrictionUpdateReport {
  schemaVersion: "regulatory-radar-dls-update-v1";
  generatedAt: string;
  mode: "candidate_only";
  status: "unchanged" | "changed" | "invalid";
  safeToOpenPullRequest: boolean;
  refreshFrom: string;
  baseline: {
    generatedAt: string;
    recordCount: number;
    latestDocumentDate: string | null;
    sha256: string;
  };
  candidate: {
    generatedAt: string;
    recordCount: number;
    latestDocumentDate: string | null;
    sha256: string;
  };
  changes: {
    addedCount: number;
    updatedCount: number;
    removedCount: number;
    totalCount: number;
    addedByType: Record<SeriesRestrictionEventType, number>;
    updatedByType: Record<SeriesRestrictionEventType, number>;
    preview: SeriesRestrictionChangePreview[];
    previewTruncated: boolean;
  };
  checks: SeriesRestrictionUpdateCheck[];
}

function eventCounts(): Record<SeriesRestrictionEventType, number> {
  return Object.fromEntries(
    SERIES_RESTRICTION_EVENT_TYPES.map((eventType) => [eventType, 0]),
  ) as Record<SeriesRestrictionEventType, number>;
}

function comparableRecord(record: SeriesRestrictionRecord): string {
  const { sourceOrder: _sourceOrder, ...content } = record;
  return JSON.stringify(content);
}

function changedFields(
  baseline: SeriesRestrictionRecord,
  candidate: SeriesRestrictionRecord,
): string[] {
  return Object.keys(candidate).filter(
    (key) =>
      key !== "sourceOrder" &&
      JSON.stringify(candidate[key as keyof SeriesRestrictionRecord]) !==
        JSON.stringify(baseline[key as keyof SeriesRestrictionRecord]),
  );
}

function preview(
  record: SeriesRestrictionRecord,
  changeKind: SeriesRestrictionChangePreview["changeKind"],
  fields: string[] = [],
): SeriesRestrictionChangePreview {
  return {
    changeKind,
    changedFields: fields,
    documentDate: record.documentDate,
    documentNumber: record.documentNumber,
    eventType: record.eventType,
    registrationNumber: record.registrationNumber,
    medicineName: record.medicineName,
    seriesRaw: record.seriesRaw,
  };
}

function groupedRecords(
  records: SeriesRestrictionRecord[],
): Map<string, SeriesRestrictionRecord[]> {
  const result = new Map<string, SeriesRestrictionRecord[]>();
  for (const record of records) {
    const identity = seriesRestrictionRecordIdentity(record);
    const group = result.get(identity) ?? [];
    group.push(record);
    result.set(identity, group);
  }
  return result;
}

export function compareSeriesRestrictionSnapshots(
  baseline: SeriesRestrictionSnapshot,
  candidate: SeriesRestrictionSnapshot,
  previewLimit = 100,
): SeriesRestrictionUpdateReport["changes"] {
  const baselineGroups = groupedRecords(baseline.records);
  const candidateGroups = groupedRecords(candidate.records);
  const added: SeriesRestrictionRecord[] = [];
  const updated: Array<{
    record: SeriesRestrictionRecord;
    changedFields: string[];
  }> = [];
  let removedCount = 0;

  const identities = new Set([
    ...baselineGroups.keys(),
    ...candidateGroups.keys(),
  ]);
  for (const identity of identities) {
    const baselineGroup = [...(baselineGroups.get(identity) ?? [])];
    const candidateGroup = [...(candidateGroups.get(identity) ?? [])];
    const unmatchedBaseline = new Map<string, SeriesRestrictionRecord[]>();
    for (const record of baselineGroup) {
      const content = comparableRecord(record);
      const matches = unmatchedBaseline.get(content) ?? [];
      matches.push(record);
      unmatchedBaseline.set(content, matches);
    }

    const unmatchedCandidate: SeriesRestrictionRecord[] = [];
    for (const record of candidateGroup) {
      const content = comparableRecord(record);
      const matches = unmatchedBaseline.get(content);
      if (matches?.length) {
        matches.pop();
        if (matches.length === 0) unmatchedBaseline.delete(content);
      } else {
        unmatchedCandidate.push(record);
      }
    }

    const unmatchedBaselineRecords = [...unmatchedBaseline.values()].flat();
    const unmatchedBaselineCount = unmatchedBaselineRecords.length;
    const updateCount = Math.min(
      unmatchedBaselineCount,
      unmatchedCandidate.length,
    );
    updated.push(
      ...unmatchedCandidate.slice(0, updateCount).map((record, index) => ({
        record,
        changedFields: changedFields(unmatchedBaselineRecords[index], record),
      })),
    );
    added.push(...unmatchedCandidate.slice(updateCount));
    removedCount += unmatchedBaselineCount - updateCount;
  }

  const addedByType = eventCounts();
  const updatedByType = eventCounts();
  for (const record of added) addedByType[record.eventType] += 1;
  for (const change of updated) updatedByType[change.record.eventType] += 1;
  const previews = [
    ...added.map((record) => preview(record, "added")),
    ...updated.map((change) =>
      preview(change.record, "updated", change.changedFields),
    ),
  ];

  return {
    addedCount: added.length,
    updatedCount: updated.length,
    removedCount,
    totalCount: added.length + updated.length + removedCount,
    addedByType,
    updatedByType,
    preview: previews.slice(0, previewLimit),
    previewTruncated: previews.length > previewLimit,
  };
}

function sameDocumentTypes(snapshot: SeriesRestrictionSnapshot): boolean {
  return (
    [...snapshot.source.documentTypeIds].sort().join(",") ===
    [...DLS_DOCUMENT_TYPE_IDS].sort().join(",")
  );
}

export function buildSeriesRestrictionUpdateCandidate(input: {
  baseline: SeriesRestrictionSnapshot;
  refresh: SeriesRestrictionSnapshot;
  refreshFrom: string;
  generatedAt?: string;
  previewLimit?: number;
}): {
  candidate: SeriesRestrictionSnapshot;
  report: SeriesRestrictionUpdateReport;
} {
  const candidate = mergeSeriesRestrictionSnapshots(
    input.baseline,
    input.refresh,
  );
  const changes = compareSeriesRestrictionSnapshots(
    input.baseline,
    candidate,
    input.previewLimit,
  );
  const latestDateNotRegressed =
    input.baseline.source.latestDocumentDate === null ||
    (candidate.source.latestDocumentDate !== null &&
      candidate.source.latestDocumentDate >=
        input.baseline.source.latestDocumentDate);
  const checks: SeriesRestrictionUpdateCheck[] = [
    {
      key: "refresh_complete",
      passed: input.refresh.source.complete,
      detail: input.refresh.source.complete
        ? "DLS export is marked complete."
        : "DLS export is incomplete.",
    },
    {
      key: "refresh_without_warnings",
      passed: input.refresh.warnings.length === 0,
      detail:
        input.refresh.warnings.length === 0
          ? "DLS export has no parser warnings."
          : `DLS export has ${input.refresh.warnings.length} warning(s).`,
    },
    {
      key: "refresh_has_records",
      passed: input.refresh.source.recordCount > 0,
      detail: `Overlap contains ${input.refresh.source.recordCount} record(s).`,
    },
    {
      key: "refresh_overlap_continuity",
      passed:
        input.refresh.source.coverageStartDate === input.refreshFrom &&
        input.refresh.source.latestDocumentDate !== null &&
        input.refresh.source.latestDocumentDate >= input.refreshFrom,
      detail:
        input.refresh.source.coverageStartDate !== input.refreshFrom
          ? `Overlap starts at ${input.refresh.source.coverageStartDate}; required ${input.refreshFrom}.`
          : input.refresh.source.latestDocumentDate === null
            ? "Overlap has no document date."
            : `Overlap reaches ${input.refresh.source.latestDocumentDate}; required from ${input.refreshFrom}.`,
    },
    {
      key: "history_preserved",
      passed: changes.removedCount === 0,
      detail:
        changes.removedCount === 0
          ? "No reviewed historical records would be removed."
          : `${changes.removedCount} reviewed record(s) would be removed.`,
    },
    {
      key: "latest_date_not_regressed",
      passed: latestDateNotRegressed,
      detail: `Baseline latest date: ${input.baseline.source.latestDocumentDate ?? "none"}; candidate: ${candidate.source.latestDocumentDate ?? "none"}.`,
    },
    {
      key: "candidate_count_consistent",
      passed: candidate.source.recordCount === candidate.records.length,
      detail: `Candidate metadata count ${candidate.source.recordCount}; actual ${candidate.records.length}.`,
    },
    {
      key: "document_types_complete",
      passed: sameDocumentTypes(input.refresh),
      detail: `Candidate refresh covers document types ${input.refresh.source.documentTypeIds.join(", ")}.`,
    },
  ];
  const valid = checks.every((check) => check.passed);
  const changed = changes.totalCount > 0;
  const status: SeriesRestrictionUpdateReport["status"] = valid
    ? changed
      ? "changed"
      : "unchanged"
    : "invalid";

  return {
    candidate,
    report: {
      schemaVersion: "regulatory-radar-dls-update-v1",
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      mode: "candidate_only",
      status,
      safeToOpenPullRequest: valid && changed,
      refreshFrom: input.refreshFrom,
      baseline: {
        generatedAt: input.baseline.generatedAt,
        recordCount: input.baseline.source.recordCount,
        latestDocumentDate: input.baseline.source.latestDocumentDate,
        sha256: input.baseline.source.sha256,
      },
      candidate: {
        generatedAt: candidate.generatedAt,
        recordCount: candidate.source.recordCount,
        latestDocumentDate: candidate.source.latestDocumentDate,
        sha256: candidate.source.sha256,
      },
      changes,
      checks,
    },
  };
}
