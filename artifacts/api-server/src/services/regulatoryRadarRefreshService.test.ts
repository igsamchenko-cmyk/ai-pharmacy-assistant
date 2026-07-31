import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DLS_DOCUMENT_TYPE_IDS } from "../knowledge/seriesRestrictions/importer";
import type {
  SeriesRestrictionRecord,
  SeriesRestrictionSnapshot,
} from "../knowledge/seriesRestrictions/model";
import {
  refreshRegulatoryRadarIfDue,
  REGULATORY_RUNTIME_REFRESH_INTERVAL_MS,
  REGULATORY_RUNTIME_RETRY_INTERVAL_MS,
  resetRegulatoryRadarRefreshStateForTests,
} from "./regulatoryRadarRefreshService";

const baseRecord: SeriesRestrictionRecord = {
  documentDate: "2026-07-29",
  documentNumber: "347-001/26",
  eventType: "temporary_ban",
  registrationNumber: "UA/1/01/01",
  medicineName: "EXAMPLE",
  dosageForm: "tablets",
  seriesRaw: "A1",
  seriesValues: ["A1"],
  allSeries: false,
  seriesUnspecified: false,
  manufacturer: "Manufacturer",
  country: "Ukraine",
  additionalInfo: "",
  sourceOrder: 0,
};

function snapshot(
  records: SeriesRestrictionRecord[],
  options: {
    generatedAt?: string;
    coverageStartDate?: string;
    complete?: boolean;
    warnings?: string[];
  } = {},
): SeriesRestrictionSnapshot {
  const normalizedRecords = records.map((record, sourceOrder) => ({
    ...record,
    sourceOrder,
  }));
  return {
    schemaVersion: "ua-dls-series-restrictions-v1",
    generatedAt: options.generatedAt ?? "2026-07-30T12:00:00.000Z",
    source: {
      title: "DLS quality documents",
      publisher: "DLS",
      url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
      coverageStartDate: options.coverageStartDate ?? "2000-01-01",
      latestDocumentDate: normalizedRecords.at(-1)?.documentDate ?? null,
      complete: options.complete ?? true,
      recordCount: normalizedRecords.length,
      requestCount: 1,
      sha256: createHash("sha256")
        .update(JSON.stringify(normalizedRecords))
        .digest("hex"),
      documentTypeIds: [...DLS_DOCUMENT_TYPE_IDS],
    },
    records: normalizedRecords,
    warnings: options.warnings ?? [],
  };
}

afterEach(() => {
  resetRegulatoryRadarRefreshStateForTests();
  vi.restoreAllMocks();
});

describe("runtime regulatory radar refresh", () => {
  it("does not contact DLS again while the verified snapshot is under 24 hours old", async () => {
    const baseline = snapshot([baseRecord], {
      generatedAt: "2026-08-01T02:00:00.000Z",
    });
    const importSnapshot = vi.fn();

    const result = await refreshRegulatoryRadarIfDue({
      now: new Date("2026-08-01T10:00:00.000Z"),
      loadSnapshot: () => baseline,
      importSnapshot,
    });

    expect(result).toMatchObject({
      status: "current",
      checkedAt: "2026-08-01T02:00:00.000Z",
      recordCount: 1,
    });
    expect(new Date(result.nextCheckAt).getTime()).toBe(
      new Date(baseline.generatedAt).getTime() +
        REGULATORY_RUNTIME_REFRESH_INTERVAL_MS,
    );
    expect(importSnapshot).not.toHaveBeenCalled();
  });

  it("promotes a valid unchanged refresh so the next app open stays within the daily window", async () => {
    const baseline = snapshot([baseRecord]);
    const refresh = snapshot([baseRecord], {
      generatedAt: "2026-08-01T10:00:00.000Z",
      coverageStartDate: "2026-06-14",
    });
    const promoteSnapshot = vi.fn((candidate) => candidate);
    const importSnapshot = vi.fn().mockResolvedValue(refresh);

    const result = await refreshRegulatoryRadarIfDue({
      now: new Date("2026-08-01T10:00:00.000Z"),
      loadSnapshot: () => baseline,
      importSnapshot,
      promoteSnapshot,
    });

    expect(importSnapshot).toHaveBeenCalledWith({
      from: "2026-06-14",
      signal: expect.any(AbortSignal),
    });
    expect(promoteSnapshot).toHaveBeenCalledTimes(1);
    expect(promoteSnapshot.mock.calls[0]?.[0].generatedAt).toBe(
      "2026-08-01T10:00:00.000Z",
    );
    expect(result).toMatchObject({
      status: "unchanged",
      checkedAt: "2026-08-01T10:00:00.000Z",
      addedCount: 0,
      updatedCount: 0,
    });
  });

  it("reports and promotes new verified DLS restrictions", async () => {
    const baseline = snapshot([baseRecord]);
    const newRestriction: SeriesRestrictionRecord = {
      ...baseRecord,
      documentDate: "2026-07-31",
      documentNumber: "355-001/26",
      eventType: "permanent_ban",
      seriesRaw: "B2",
      seriesValues: ["B2"],
      sourceOrder: 1,
    };
    const refresh = snapshot([baseRecord, newRestriction], {
      generatedAt: "2026-08-01T10:00:00.000Z",
      coverageStartDate: "2026-06-14",
    });
    const promoteSnapshot = vi.fn((candidate) => candidate);

    const result = await refreshRegulatoryRadarIfDue({
      now: new Date("2026-08-01T10:00:00.000Z"),
      loadSnapshot: () => baseline,
      importSnapshot: vi.fn().mockResolvedValue(refresh),
      promoteSnapshot,
    });

    expect(result).toMatchObject({
      status: "updated",
      recordCount: 2,
      addedCount: 1,
      updatedCount: 0,
      latestDocumentDate: "2026-07-31",
    });
    expect(promoteSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps the last verified snapshot when the upstream export fails validation", async () => {
    const baseline = snapshot([baseRecord]);
    const invalidRefresh = snapshot([baseRecord], {
      generatedAt: "2026-08-01T10:00:00.000Z",
      coverageStartDate: "2026-06-14",
      warnings: ["Parser warning"],
    });
    const promoteSnapshot = vi.fn();

    const result = await refreshRegulatoryRadarIfDue({
      now: new Date("2026-08-01T10:00:00.000Z"),
      loadSnapshot: () => baseline,
      importSnapshot: vi.fn().mockResolvedValue(invalidRefresh),
      promoteSnapshot,
    });

    expect(result).toMatchObject({
      status: "failed",
      checkedAt: "2026-08-01T10:00:00.000Z",
      recordCount: 1,
    });
    expect(promoteSnapshot).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent app-open refresh requests", async () => {
    const baseline = snapshot([baseRecord]);
    const refresh = snapshot([baseRecord], {
      generatedAt: "2026-08-01T10:00:00.000Z",
      coverageStartDate: "2026-06-14",
    });
    let resolveImport!: (value: SeriesRestrictionSnapshot) => void;
    const importPromise = new Promise<SeriesRestrictionSnapshot>((resolve) => {
      resolveImport = resolve;
    });
    const importSnapshot = vi.fn(() => importPromise);
    const options = {
      now: new Date("2026-08-01T10:00:00.000Z"),
      loadSnapshot: () => baseline,
      importSnapshot,
      promoteSnapshot: (candidate: SeriesRestrictionSnapshot) => candidate,
    };

    const first = refreshRegulatoryRadarIfDue(options);
    const second = refreshRegulatoryRadarIfDue(options);
    expect(importSnapshot).toHaveBeenCalledTimes(1);
    resolveImport(refresh);

    await expect(first).resolves.toMatchObject({ status: "unchanged" });
    await expect(second).resolves.toMatchObject({ status: "unchanged" });
    expect(importSnapshot).toHaveBeenCalledTimes(1);
  });

  it("waits 15 minutes before retrying after an upstream failure", async () => {
    const baseline = snapshot([baseRecord]);
    const importSnapshot = vi.fn().mockRejectedValue(new Error("offline"));
    const firstAttempt = new Date("2026-08-01T10:00:00.000Z");

    const first = await refreshRegulatoryRadarIfDue({
      now: firstAttempt,
      loadSnapshot: () => baseline,
      importSnapshot,
    });
    const duringCooldown = await refreshRegulatoryRadarIfDue({
      now: new Date(firstAttempt.getTime() + 5 * 60_000),
      loadSnapshot: () => baseline,
      importSnapshot,
    });

    expect(first.status).toBe("failed");
    expect(duringCooldown).toEqual(first);
    expect(importSnapshot).toHaveBeenCalledTimes(1);

    await refreshRegulatoryRadarIfDue({
      now: new Date(
        firstAttempt.getTime() + REGULATORY_RUNTIME_RETRY_INTERVAL_MS + 1,
      ),
      loadSnapshot: () => baseline,
      importSnapshot,
    });
    expect(importSnapshot).toHaveBeenCalledTimes(2);
  });
});
