import { describe, expect, it } from "vitest";
import {
  evaluateRegulatorySourceStatus,
  loadRegulatoryRadar,
  searchRegulatoryEvents,
} from "./regulatoryRadarService";

describe("regulatory radar service", () => {
  it("uses source-specific freshness without accepting future timestamps", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    expect(
      evaluateRegulatorySourceStatus({
        checkedAt: "2026-07-30T00:00:00.000Z",
        now,
        freshnessMs: 24 * 60 * 60 * 1_000,
        complete: true,
      }),
    ).toBe("current");
    expect(
      evaluateRegulatorySourceStatus({
        checkedAt: "2026-07-28T00:00:00.000Z",
        now,
        freshnessMs: 24 * 60 * 60 * 1_000,
        complete: true,
      }),
    ).toBe("stale");
    expect(
      evaluateRegulatorySourceStatus({
        checkedAt: "2026-07-31T00:00:00.000Z",
        now,
        freshnessMs: 24 * 60 * 60 * 1_000,
        complete: true,
      }),
    ).toBe("stale");
    expect(
      evaluateRegulatorySourceStatus({
        checkedAt: "2026-07-30T00:00:00.000Z",
        now,
        freshnessMs: 24 * 60 * 60 * 1_000,
        complete: false,
      }),
    ).toBe("incomplete");
  });

  it("loads all verified official snapshots and returns a bounded journal", () => {
    const radar = loadRegulatoryRadar({
      now: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(radar.sources.map((source) => source.key)).toEqual([
      "series_restrictions",
      "dispensing_categories",
      "reimbursement",
      "price_catalog",
      "national_list",
    ]);
    expect(radar.summary.sourceCount).toBe(5);
    expect(radar.summary.recentEventCount).toBeGreaterThanOrEqual(
      radar.events.length,
    );
    expect(radar.events.length).toBeLessThanOrEqual(50);
    expect(radar.window.days).toBe(30);
    expect(radar.sources[0]?.latestChangeDate).not.toBeNull();
    expect(radar.window.to.toISOString()).toBe(
      radar.sources[0]?.latestChangeDate?.toISOString(),
    );
    expect(
      radar.events.every(
        (event) => event.sourceUrl === radar.sources[0]?.sourceUrl,
      ),
    ).toBe(true);
    expect(
      radar.events.find(
        (event) =>
          event.documentNumber === "350-001.001/002.0/17-26" &&
          event.type === "restore_temporary",
      )?.additionalInfo,
    ).toContain("160-001.2/002.0/17-26");
  });

  it("searches historical prohibitions across the complete verified journal", () => {
    const allEvents = searchRegulatoryEvents({
      q: "UA/3924/01/01",
      filter: "all",
    });
    const permanent = searchRegulatoryEvents({
      q: "ua39240101",
      filter: "permanent_ban",
    });

    expect(allEvents).toMatchObject({
      scope: "full_history",
      total: 6,
      page: 1,
      pageCount: 1,
    });
    expect(allEvents.events.map((event) => event.type)).toEqual([
      "restore_temporary",
      "temporary_ban",
      "restore_temporary",
      "temporary_ban",
      "permanent_ban",
      "temporary_ban",
    ]);
    expect(permanent).toMatchObject({
      scope: "full_history",
      total: 1,
    });
    expect(permanent.events[0]).toMatchObject({
      registrationNumber: "UA/3924/01/01",
      medicineName: "КЛОПІДОГРЕЛЬ",
      type: "permanent_ban",
      series: "10212",
    });
  });
});
