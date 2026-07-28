import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveDataFilePath } from "../../lib/dataPath";
import { TtlCache } from "../../lib/cache";
import {
  SeriesRestrictionSnapshotSchema,
  type SeriesRestrictionSnapshot,
} from "./model";
import { normalizeRegistrationNumber, normalizeSeries } from "./parser";

export const DLS_QUALITY_DOCUMENTS_URL =
  "https://pub-mex.dls.gov.ua/QLA/DocList.aspx";
export const SERIES_RESTRICTION_FRESHNESS_MS = 36 * 60 * 60 * 1_000;

const snapshotCache = new TtlCache<SeriesRestrictionSnapshot>({
  ttlMs: 5 * 60_000,
  maxEntries: 1,
});

export type SeriesRestrictionStatus =
  | "blocked"
  | "restored"
  | "no_match"
  | "needs_review";

export interface SeriesRestrictionCheckResult {
  version: "1.0";
  productId: string;
  registrationNumber: string;
  series: string;
  status: SeriesRestrictionStatus;
  action: "stop" | "manual_review";
  summary: string;
  matchedAllSeries: boolean;
  matchedUnspecifiedSeries: boolean;
  otherSeriesEventCount: number;
  events: SeriesRestrictionSnapshot["records"];
  source: {
    title: string;
    url: string;
    generatedAt: string;
    latestDocumentDate: string | null;
    coverageStartDate: string;
    complete: boolean;
    recordCount: number;
    sha256: string;
    freshness: "current" | "stale" | "incomplete";
  };
}

function readSnapshot(): SeriesRestrictionSnapshot {
  const cached = snapshotCache.get("snapshot");
  if (cached) return cached;
  const path = resolveDataFilePath("data/series-restrictions/ua-dls.json");
  const raw = readFileSync(path, "utf8");
  const parsed = SeriesRestrictionSnapshotSchema.parse(JSON.parse(raw));
  const canonicalRecords = JSON.stringify(parsed.records);
  const actualHash = createHash("sha256")
    .update(canonicalRecords)
    .digest("hex");
  if (actualHash !== parsed.source.sha256) {
    throw new Error("series_restriction_snapshot_hash_mismatch");
  }
  if (parsed.source.recordCount !== parsed.records.length) {
    throw new Error("series_restriction_snapshot_count_mismatch");
  }
  snapshotCache.set("snapshot", parsed);
  return parsed;
}

function freshness(
  snapshot: SeriesRestrictionSnapshot,
  now: Date,
): "current" | "stale" | "incomplete" {
  if (!snapshot.source.complete || snapshot.warnings.length > 0) {
    return "incomplete";
  }
  const generated = new Date(snapshot.generatedAt).getTime();
  return Number.isFinite(generated) &&
    now.getTime() - generated <= SERIES_RESTRICTION_FRESHNESS_MS
    ? "current"
    : "stale";
}

function byChronology(
  left: SeriesRestrictionSnapshot["records"][number],
  right: SeriesRestrictionSnapshot["records"][number],
): number {
  return (
    left.documentDate.localeCompare(right.documentDate) ||
    left.documentNumber.localeCompare(right.documentNumber, "uk-UA", {
      numeric: true,
    }) ||
    left.sourceOrder - right.sourceOrder
  );
}

export function checkSeriesRestrictions(
  productId: string,
  registrationNumber: string,
  series: string,
  options: { snapshot?: SeriesRestrictionSnapshot; now?: Date } = {},
): SeriesRestrictionCheckResult {
  const snapshot = options.snapshot ?? readSnapshot();
  const normalizedRegistration =
    normalizeRegistrationNumber(registrationNumber);
  const normalizedSeries = normalizeSeries(series);
  if (!/^UA\/\d+\/\d+\/\d+$/u.test(normalizedRegistration)) {
    throw new Error("invalid_registration_number");
  }
  if (!normalizedSeries || normalizedSeries.length > 80) {
    throw new Error("invalid_series_number");
  }

  const sameRegistration = snapshot.records.filter(
    (record) =>
      record.registrationNumber !== null &&
      normalizeRegistrationNumber(record.registrationNumber) ===
        normalizedRegistration,
  );
  const matches = sameRegistration
    .filter(
      (record) =>
        record.allSeries ||
        record.seriesUnspecified ||
        record.seriesValues.some(
          (candidate) => normalizeSeries(candidate) === normalizedSeries,
        ),
    )
    .sort(byChronology);

  let state: "blocked" | "restored" | null = null;
  for (const event of matches) {
    if (
      event.eventType === "temporary_ban" ||
      event.eventType === "permanent_ban"
    ) {
      state = "blocked";
    } else if (
      (event.eventType === "restore_temporary" ||
        event.eventType === "restore_permanent" ||
        event.eventType === "partial_cancellation") &&
      !event.seriesUnspecified
    ) {
      state = "restored";
    }
  }

  const status: SeriesRestrictionStatus =
    state ?? (matches.length ? "needs_review" : "no_match");
  const summary =
    status === "blocked" && matches.some((event) => event.seriesUnspecified)
      ? "Знайдено чинну заборону для цієї реєстрації, але серію в документі не зазначено. Відпуск слід зупинити й перевірити документ вручну."
      : status === "blocked"
        ? "Знайдено чинну заборону для цієї реєстрації та серії. Відпуск слід зупинити."
        : status === "restored"
          ? "Знайдено документ про поновлення обігу або скасування заборони. Перед відпуском перевірте актуальний офіційний реєстр."
          : status === "needs_review"
            ? "Знайдено пов'язаний документ, який не змінює стан автоматично. Потрібна ручна перевірка."
            : "Точного збігу в локальному знімку не знайдено. Це не підтверджує відсутність заборони.";
  const sourceFreshness = freshness(snapshot, options.now ?? new Date());

  return {
    version: "1.0",
    productId,
    registrationNumber: normalizedRegistration,
    series: normalizedSeries,
    status,
    action: status === "blocked" ? "stop" : "manual_review",
    summary,
    matchedAllSeries: matches.some((record) => record.allSeries),
    otherSeriesEventCount: sameRegistration.length - matches.length,
    matchedUnspecifiedSeries: matches.some(
      (record) => record.seriesUnspecified,
    ),
    events: [...matches].reverse().slice(0, 50),
    source: {
      title: snapshot.source.title,
      url: snapshot.source.url,
      generatedAt: snapshot.generatedAt,
      latestDocumentDate: snapshot.source.latestDocumentDate,
      coverageStartDate: snapshot.source.coverageStartDate,
      complete: snapshot.source.complete,
      recordCount: snapshot.source.recordCount,
      sha256: snapshot.source.sha256,
      freshness: sourceFreshness,
    },
  };
}

export function clearSeriesRestrictionCache(): void {
  snapshotCache.clear();
}
