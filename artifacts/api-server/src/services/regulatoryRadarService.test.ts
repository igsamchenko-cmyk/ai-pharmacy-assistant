import { describe, expect, it } from "vitest";
import {
  evaluateRegulatorySourceStatus,
  loadRegulatoryRadar,
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
    expect(radar.window.to.toISOString().slice(0, 10)).toBe("2026-07-30");
    expect(
      radar.events.every(
        (event) => event.sourceUrl === radar.sources[0]?.sourceUrl,
      ),
    ).toBe(true);
  });
});
