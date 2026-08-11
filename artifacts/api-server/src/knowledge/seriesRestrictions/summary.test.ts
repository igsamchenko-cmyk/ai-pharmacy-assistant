import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  SeriesRestrictionRecord,
  SeriesRestrictionSnapshot,
} from "./model";
import { summarizeProductSeriesRestrictions } from "./summary";

function record(
  documentDate: string,
  eventType: SeriesRestrictionRecord["eventType"],
  registrationNumber: string,
  series: string,
  sourceOrder: number,
): SeriesRestrictionRecord {
  return {
    documentDate,
    documentNumber: `${documentDate}-${sourceOrder}`,
    eventType,
    registrationNumber,
    medicineName: "ТЕСТ",
    dosageForm: "розчин для ін'єкцій",
    seriesRaw: series,
    seriesValues: series === "всі серії" ? [] : [series],
    allSeries: series === "всі серії",
    seriesUnspecified: false,
    manufacturer: "Виробник",
    country: "Україна",
    additionalInfo: "",
    sourceOrder,
  };
}

function snapshot(
  records: SeriesRestrictionRecord[],
): SeriesRestrictionSnapshot {
  return {
    schemaVersion: "ua-dls-series-restrictions-v1",
    generatedAt: "2026-08-01T08:00:00.000Z",
    source: {
      title: "Реєстр документів щодо якості лікарських засобів",
      publisher: "Держлікслужба",
      url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
      coverageStartDate: "2000-01-01",
      latestDocumentDate: "2026-08-01",
      complete: true,
      recordCount: records.length,
      requestCount: 1,
      sha256: createHash("sha256")
        .update(JSON.stringify(records))
        .digest("hex"),
      documentTypeIds: ["48"],
    },
    records,
    warnings: [],
  };
}

describe("product series-restriction summary", () => {
  it("raises a conservative badge and returns only exact-registration events", () => {
    const data = snapshot([
      record("2026-07-20", "temporary_ban", "UA/10001/01/01", " ab-1 ", 0),
      record("2026-07-25", "restore_temporary", "UA/10001/01/01", "AB-1", 1),
      record("2026-07-28", "permanent_ban", "UA/20002/01/01", "OTHER", 2),
    ]);

    const result = summarizeProductSeriesRestrictions("ua/10001/01/01", {
      snapshot: data,
      now: new Date("2026-08-01T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      registrationNumber: "UA/10001/01/01",
      hasAnyRestriction: true,
      requiresSeriesCheck: true,
      eventCount: 2,
      restrictedSeries: ["AB-1"],
      allSeriesAffected: false,
      source: { freshness: "current" },
    });
    expect(result.events.map((event) => event.eventType)).toEqual([
      "restore_temporary",
      "temporary_ban",
    ]);
  });

  it("does not ask for a series when no prohibition document exists", () => {
    const data = snapshot([
      record("2026-07-20", "supplement", "UA/10001/01/01", "AB-1", 0),
    ]);
    const result = summarizeProductSeriesRestrictions("UA/10001/01/01", {
      snapshot: data,
      now: new Date("2026-08-01T12:00:00.000Z"),
    });

    expect(result.hasAnyRestriction).toBe(false);
    expect(result.requiresSeriesCheck).toBe(false);
    expect(result.eventCount).toBe(1);
  });
});
