import {
  importSeriesRestrictions,
  seriesRestrictionOverlapStart,
} from "../knowledge/seriesRestrictions/importer";
import type { SeriesRestrictionSnapshot } from "../knowledge/seriesRestrictions/model";
import {
  loadSeriesRestrictionSnapshot,
  setRuntimeSeriesRestrictionSnapshot,
} from "../knowledge/seriesRestrictions/catalog";
import { buildSeriesRestrictionUpdateCandidate } from "../knowledge/seriesRestrictions/update";
import { clearRegulatoryRadarCache } from "./regulatoryRadarService";

export const REGULATORY_RUNTIME_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const REGULATORY_RUNTIME_RETRY_INTERVAL_MS = 15 * 60 * 1_000;
const REGULATORY_RUNTIME_REFRESH_TIMEOUT_MS = 45_000;
const REGULATORY_RUNTIME_OVERLAP_DAYS = 45;

export type RegulatoryRadarRefreshStatus =
  | "current"
  | "unchanged"
  | "updated"
  | "failed";

export interface RegulatoryRadarRefreshResult {
  version: "1.0";
  status: RegulatoryRadarRefreshStatus;
  checkedAt: string;
  nextCheckAt: string;
  latestDocumentDate: string | null;
  recordCount: number;
  addedCount: number;
  updatedCount: number;
}

interface RefreshDependencies {
  now?: Date;
  loadSnapshot?: () => SeriesRestrictionSnapshot;
  importSnapshot?: (options: {
    from: string;
    signal: AbortSignal;
  }) => Promise<SeriesRestrictionSnapshot>;
  promoteSnapshot?: (
    snapshot: SeriesRestrictionSnapshot,
  ) => SeriesRestrictionSnapshot;
  timeoutMs?: number;
}

let inFlight: Promise<RegulatoryRadarRefreshResult> | null = null;
let lastFailureAt: number | null = null;
let lastFailureResult: RegulatoryRadarRefreshResult | null = null;

function parsedTime(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function plusMilliseconds(value: string, milliseconds: number): string {
  const parsed = parsedTime(value) ?? Date.now();
  return new Date(parsed + milliseconds).toISOString();
}

function resultForSnapshot(
  snapshot: SeriesRestrictionSnapshot,
  status: RegulatoryRadarRefreshStatus,
  changes: { addedCount?: number; updatedCount?: number } = {},
  nextCheckAt = plusMilliseconds(
    snapshot.generatedAt,
    REGULATORY_RUNTIME_REFRESH_INTERVAL_MS,
  ),
): RegulatoryRadarRefreshResult {
  return {
    version: "1.0",
    status,
    checkedAt: snapshot.generatedAt,
    nextCheckAt,
    latestDocumentDate: snapshot.source.latestDocumentDate,
    recordCount: snapshot.source.recordCount,
    addedCount: changes.addedCount ?? 0,
    updatedCount: changes.updatedCount ?? 0,
  };
}

function isFresh(snapshot: SeriesRestrictionSnapshot, now: Date): boolean {
  const generatedAt = parsedTime(snapshot.generatedAt);
  if (generatedAt === null) return false;
  const age = now.getTime() - generatedAt;
  return age >= 0 && age < REGULATORY_RUNTIME_REFRESH_INTERVAL_MS;
}

function failedResult(
  baseline: SeriesRestrictionSnapshot,
  now: Date,
): RegulatoryRadarRefreshResult {
  const result = resultForSnapshot(
    baseline,
    "failed",
    {},
    new Date(
      now.getTime() + REGULATORY_RUNTIME_RETRY_INTERVAL_MS,
    ).toISOString(),
  );
  return {
    ...result,
    checkedAt: now.toISOString(),
  };
}

async function runRefresh(
  baseline: SeriesRestrictionSnapshot,
  options: RefreshDependencies,
  now: Date,
): Promise<RegulatoryRadarRefreshResult> {
  try {
    const signal = AbortSignal.timeout(
      options.timeoutMs ?? REGULATORY_RUNTIME_REFRESH_TIMEOUT_MS,
    );
    const refreshFrom = seriesRestrictionOverlapStart(
      baseline,
      REGULATORY_RUNTIME_OVERLAP_DAYS,
    );
    const refresh = await (options.importSnapshot ?? importSeriesRestrictions)({
      from: refreshFrom,
      signal,
    });
    const { candidate, report } = buildSeriesRestrictionUpdateCandidate({
      baseline,
      refresh,
      refreshFrom,
      generatedAt: now.toISOString(),
    });

    if (
      report.status === "invalid" ||
      !report.checks.every((check) => check.passed)
    ) {
      lastFailureAt = now.getTime();
      lastFailureResult = failedResult(baseline, now);
      return lastFailureResult;
    }

    const promoted = (
      options.promoteSnapshot ?? setRuntimeSeriesRestrictionSnapshot
    )(candidate);
    clearRegulatoryRadarCache();
    lastFailureAt = null;
    lastFailureResult = null;
    return resultForSnapshot(
      promoted,
      report.status === "changed" ? "updated" : "unchanged",
      report.changes,
    );
  } catch {
    lastFailureAt = now.getTime();
    lastFailureResult = failedResult(baseline, now);
    return lastFailureResult;
  }
}

export async function refreshRegulatoryRadarIfDue(
  options: RefreshDependencies = {},
): Promise<RegulatoryRadarRefreshResult> {
  if (inFlight) return inFlight;

  const now = options.now ?? new Date();
  const baseline = (options.loadSnapshot ?? loadSeriesRestrictionSnapshot)();
  if (isFresh(baseline, now)) {
    return resultForSnapshot(baseline, "current");
  }
  if (
    lastFailureAt !== null &&
    now.getTime() - lastFailureAt < REGULATORY_RUNTIME_RETRY_INTERVAL_MS &&
    lastFailureResult
  ) {
    return lastFailureResult;
  }

  inFlight = runRefresh(baseline, options, now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetRegulatoryRadarRefreshStateForTests(): void {
  inFlight = null;
  lastFailureAt = null;
  lastFailureResult = null;
}
