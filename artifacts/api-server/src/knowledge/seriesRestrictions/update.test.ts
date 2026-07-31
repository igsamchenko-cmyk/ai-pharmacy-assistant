import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DLS_DOCUMENT_TYPE_IDS } from "./importer";
import type {
  SeriesRestrictionRecord,
  SeriesRestrictionSnapshot,
} from "./model";
import {
  buildSeriesRestrictionUpdateCandidate,
  compareSeriesRestrictionSnapshots,
} from "./update";

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
    documentTypeIds?: string[];
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
      documentTypeIds: options.documentTypeIds ?? [...DLS_DOCUMENT_TYPE_IDS],
    },
    records: normalizedRecords,
    warnings: options.warnings ?? [],
  };
}

describe("DLS regulatory update candidate", () => {
  it("does not write a false change when the overlap only repeats reviewed rows", () => {
    const baseline = snapshot([baseRecord]);
    const refresh = snapshot([baseRecord], {
      generatedAt: "2026-07-31T06:00:00.000Z",
      coverageStartDate: "2026-06-14",
    });
    const result = buildSeriesRestrictionUpdateCandidate({
      baseline,
      refresh,
      refreshFrom: "2026-06-14",
      generatedAt: "2026-07-31T06:05:00.000Z",
    });

    expect(result.report.status).toBe("unchanged");
    expect(result.report.safeToOpenPullRequest).toBe(false);
    expect(result.report.changes.totalCount).toBe(0);
    expect(result.report.checks.every((check) => check.passed)).toBe(true);
  });

  it("ignores source-order-only differences", () => {
    const baseline = snapshot([baseRecord]);
    const refresh = snapshot([{ ...baseRecord, sourceOrder: 99 }], {
      generatedAt: "2026-07-31T06:00:00.000Z",
      coverageStartDate: "2026-06-14",
    });
    refresh.records[0].sourceOrder = 99;

    const result = buildSeriesRestrictionUpdateCandidate({
      baseline,
      refresh,
      refreshFrom: "2026-06-14",
    });

    expect(result.report.status).toBe("unchanged");
    expect(result.report.safeToOpenPullRequest).toBe(false);
    expect(result.report.changes.totalCount).toBe(0);
  });

  it("reports added and corrected records without deleting reviewed history", () => {
    const historic = {
      ...baseRecord,
      documentDate: "2020-01-01",
      documentNumber: "historic",
      seriesRaw: "OLD",
      seriesValues: ["OLD"],
    };
    const restored: SeriesRestrictionRecord = {
      ...baseRecord,
      documentDate: "2026-07-31",
      documentNumber: "355-001/26",
      eventType: "restore_temporary",
      additionalInfo: "Circulation restored",
      sourceOrder: 1,
    };
    const baseline = snapshot([historic, baseRecord]);
    const refresh = snapshot(
      [{ ...baseRecord, additionalInfo: "Official clarification" }, restored],
      {
        generatedAt: "2026-07-31T06:00:00.000Z",
        coverageStartDate: "2026-06-14",
      },
    );
    const result = buildSeriesRestrictionUpdateCandidate({
      baseline,
      refresh,
      refreshFrom: "2026-06-14",
    });

    expect(result.report.status).toBe("changed");
    expect(result.report.safeToOpenPullRequest).toBe(true);
    expect(result.report.changes).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
      removedCount: 0,
      totalCount: 2,
    });
    expect(result.report.changes.addedByType.restore_temporary).toBe(1);
    expect(result.report.changes.updatedByType.temporary_ban).toBe(1);
    expect(
      result.report.changes.preview.find(
        (change) => change.changeKind === "updated",
      ),
    ).toMatchObject({
      documentNumber: "347-001/26",
      changedFields: ["additionalInfo"],
    });
    expect(
      result.candidate.records.some(
        (record) => record.documentNumber === "historic",
      ),
    ).toBe(true);
  });

  it("blocks a candidate when an official document type is missing", () => {
    const baseline = snapshot([baseRecord]);
    const refresh = snapshot(
      [
        baseRecord,
        {
          ...baseRecord,
          documentDate: "2026-07-31",
          documentNumber: "new",
        },
      ],
      {
        coverageStartDate: "2026-06-14",
        documentTypeIds: ["48"],
      },
    );
    const result = buildSeriesRestrictionUpdateCandidate({
      baseline,
      refresh,
      refreshFrom: "2026-06-14",
    });

    expect(result.report.status).toBe("invalid");
    expect(result.report.safeToOpenPullRequest).toBe(false);
    expect(
      result.report.checks.find(
        (check) => check.key === "document_types_complete",
      ),
    ).toMatchObject({ passed: false });
  });

  it("blocks a refresh whose declared overlap starts after the requested date", () => {
    const baseline = snapshot([baseRecord]);
    const refresh = snapshot([baseRecord], {
      coverageStartDate: "2026-06-15",
    });
    const result = buildSeriesRestrictionUpdateCandidate({
      baseline,
      refresh,
      refreshFrom: "2026-06-14",
    });

    expect(result.report.status).toBe("invalid");
    expect(
      result.report.checks.find(
        (check) => check.key === "refresh_overlap_continuity",
      ),
    ).toMatchObject({ passed: false });
  });

  it("detects removed reviewed records in a direct snapshot comparison", () => {
    const baseline = snapshot([
      baseRecord,
      {
        ...baseRecord,
        documentDate: "2026-07-30",
        documentNumber: "second",
      },
    ]);
    const candidate = snapshot([baseRecord]);

    expect(
      compareSeriesRestrictionSnapshots(baseline, candidate),
    ).toMatchObject({
      addedCount: 0,
      updatedCount: 0,
      removedCount: 1,
    });
  });
});
