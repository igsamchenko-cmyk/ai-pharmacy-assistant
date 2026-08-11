import {
  DLS_QUALITY_DOCUMENTS_URL,
  loadSeriesRestrictionSnapshot,
  seriesRestrictionFreshness,
} from "./catalog";
import type {
  SeriesRestrictionRecord,
  SeriesRestrictionSnapshot,
} from "./model";
import { normalizeRegistrationNumber, normalizeSeries } from "./parser";

export interface ProductSeriesRestrictionSummary {
  version: "1.0";
  registrationNumber: string;
  hasAnyRestriction: boolean;
  requiresSeriesCheck: boolean;
  eventCount: number;
  restrictedSeries: string[];
  allSeriesAffected: boolean;
  unspecifiedSeriesAffected: boolean;
  events: SeriesRestrictionRecord[];
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

const RESTRICTION_EVENT_TYPES = new Set(["temporary_ban", "permanent_ban"]);

function byNewest(
  left: SeriesRestrictionRecord,
  right: SeriesRestrictionRecord,
): number {
  return (
    right.documentDate.localeCompare(left.documentDate) ||
    right.documentNumber.localeCompare(left.documentNumber, "uk-UA", {
      numeric: true,
    }) ||
    right.sourceOrder - left.sourceOrder
  );
}

export function summarizeProductSeriesRestrictions(
  registrationNumber: string,
  options: { snapshot?: SeriesRestrictionSnapshot; now?: Date } = {},
): ProductSeriesRestrictionSummary {
  const normalizedRegistration =
    normalizeRegistrationNumber(registrationNumber);
  if (!/^UA\/\d+\/\d+\/\d+$/u.test(normalizedRegistration)) {
    throw new Error("invalid_registration_number");
  }

  const snapshot = options.snapshot ?? loadSeriesRestrictionSnapshot();
  const events = snapshot.records
    .filter(
      (record) =>
        record.registrationNumber !== null &&
        normalizeRegistrationNumber(record.registrationNumber) ===
          normalizedRegistration,
    )
    .sort(byNewest);
  const restrictionEvents = events.filter((event) =>
    RESTRICTION_EVENT_TYPES.has(event.eventType),
  );
  const restrictedSeries = [
    ...new Set(
      restrictionEvents.flatMap((event) =>
        event.seriesValues.map(normalizeSeries).filter(Boolean),
      ),
    ),
  ].slice(0, 100);

  return {
    version: "1.0",
    registrationNumber: normalizedRegistration,
    hasAnyRestriction: restrictionEvents.length > 0,
    requiresSeriesCheck: restrictionEvents.length > 0,
    eventCount: events.length,
    restrictedSeries,
    allSeriesAffected: restrictionEvents.some((event) => event.allSeries),
    unspecifiedSeriesAffected: restrictionEvents.some(
      (event) => event.seriesUnspecified,
    ),
    events: events.slice(0, 50),
    source: {
      title: snapshot.source.title,
      url: snapshot.source.url || DLS_QUALITY_DOCUMENTS_URL,
      generatedAt: snapshot.generatedAt,
      latestDocumentDate: snapshot.source.latestDocumentDate,
      coverageStartDate: snapshot.source.coverageStartDate,
      complete: snapshot.source.complete,
      recordCount: snapshot.source.recordCount,
      sha256: snapshot.source.sha256,
      freshness: seriesRestrictionFreshness(
        snapshot,
        options.now ?? new Date(),
      ),
    },
  };
}
