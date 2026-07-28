import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  SeriesRestrictionRecord,
  SeriesRestrictionSnapshot,
} from "./model";
import { checkSeriesRestrictions } from "./catalog";

function record(
  documentDate: string,
  eventType: SeriesRestrictionRecord["eventType"],
  seriesRaw: string,
  options: Partial<SeriesRestrictionRecord> = {},
): SeriesRestrictionRecord {
  return {
    documentDate,
    documentNumber: `${documentDate}:${eventType}`,
    eventType,
    registrationNumber: "UA/10001/01/01",
    medicineName: "ТЕСТ",
    dosageForm: "таблетки",
    seriesRaw,
    seriesValues: seriesRaw === "всі серії" ? [] : [seriesRaw.toUpperCase()],
    allSeries: seriesRaw === "всі серії",
    seriesUnspecified: false,
    manufacturer: "Виробник",
    country: "Україна",
    additionalInfo: "",
    sourceOrder: 0,
    ...options,
  };
}

function snapshot(
  records: SeriesRestrictionRecord[],
): SeriesRestrictionSnapshot {
  return {
    schemaVersion: "ua-dls-series-restrictions-v1",
    generatedAt: "2026-07-27T08:00:00.000Z",
    source: {
      title: "Реєстр документів щодо якості лікарських засобів",
      publisher: "Держлікслужба",
      url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
      coverageStartDate: "2000-01-01",
      latestDocumentDate: "2026-07-27",
      complete: true,
      recordCount: records.length,
      requestCount: 6,
      sha256: createHash("sha256")
        .update(JSON.stringify(records))
        .digest("hex"),
      documentTypeIds: ["48", "50", "58", "59", "66", "93"],
    },
    records,
    warnings: [],
  };
}

describe("series restriction reducer", () => {
  it("blocks an exact series and does not fuzzy-match punctuation", () => {
    const data = snapshot([record("2026-07-20", "permanent_ban", "AB-123")]);

    expect(
      checkSeriesRestrictions("A".repeat(32), "UA/10001/01/01", "ab-123", {
        snapshot: data,
        now: new Date("2026-07-27T10:00:00.000Z"),
      }).status,
    ).toBe("blocked");
    expect(
      checkSeriesRestrictions("A".repeat(32), "UA/10001/01/01", "AB123", {
        snapshot: data,
        now: new Date("2026-07-27T10:00:00.000Z"),
      }).status,
    ).toBe("no_match");
  });

  it("lets a later exact restoration override an earlier ban only for that series", () => {
    const data = snapshot([
      record("2026-07-01", "temporary_ban", "всі серії"),
      record("2026-07-10", "restore_temporary", "A-1", { sourceOrder: 1 }),
    ]);

    expect(
      checkSeriesRestrictions("A".repeat(32), "UA/10001/01/01", "A-1", {
        snapshot: data,
        now: new Date("2026-07-27T10:00:00.000Z"),
      }).status,
    ).toBe("restored");
    expect(
      checkSeriesRestrictions("A".repeat(32), "UA/10001/01/01", "B-2", {
        snapshot: data,
        now: new Date("2026-07-27T10:00:00.000Z"),
      }).status,
    ).toBe("blocked");
  });

  it("keeps no-match fail-closed and marks an old snapshot stale", () => {
    const result = checkSeriesRestrictions(
      "A".repeat(32),
      "UA/10001/01/01",
      "UNKNOWN",
      {
        snapshot: snapshot([]),
        now: new Date("2026-07-30T10:00:00.000Z"),
      },
    );

    expect(result.status).toBe("no_match");
    expect(result.action).toBe("manual_review");
    expect(result.summary).toContain("не підтверджує");
    expect(result.source.freshness).toBe("stale");
  });

  it("stops on a ban whose official row omits the series, but does not auto-restore from an unspecified row", () => {
    const unspecifiedBan = record(
      "2026-07-20",
      "permanent_ban",
      "Серію не зазначено в реєстрі",
      {
        seriesValues: [],
        seriesUnspecified: true,
      },
    );
    const blocked = checkSeriesRestrictions(
      "A".repeat(32),
      "UA/10001/01/01",
      "ANY-1",
      {
        snapshot: snapshot([unspecifiedBan]),
        now: new Date("2026-07-27T10:00:00.000Z"),
      },
    );
    expect(blocked.status).toBe("blocked");
    expect(blocked.matchedUnspecifiedSeries).toBe(true);

    const unspecifiedRestore = record(
      "2026-07-21",
      "restore_permanent",
      "Серію не зазначено в реєстрі",
      {
        seriesValues: [],
        seriesUnspecified: true,
      },
    );
    const review = checkSeriesRestrictions(
      "A".repeat(32),
      "UA/10001/01/01",
      "ANY-1",
      {
        snapshot: snapshot([unspecifiedRestore]),
        now: new Date("2026-07-27T10:00:00.000Z"),
      },
    );
    expect(review.status).toBe("needs_review");
    expect(review.action).toBe("manual_review");
  });
});
