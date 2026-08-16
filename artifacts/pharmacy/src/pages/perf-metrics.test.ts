import { describe, expect, it } from "vitest";
import type { SearchMetricRecord } from "@/lib/search-metrics";
import { metricDistribution } from "./perf-metrics";

function record(value: number | null): SearchMetricRecord {
  return {
    id: String(value),
    ts: 0,
    cold: false,
    ttir: value,
    ttfr: value,
    ttc: value,
    ttSec: value,
    catalogSize: 16_533,
    indexBuildMs: 0,
    serializedIndexBytes: 1,
    uaMobile: false,
  };
}

describe("performance metrics summary", () => {
  it("calculates median and p90 while ignoring incomplete sessions", () => {
    const records = [10, 20, 30, 40, 50, null].map(record);
    expect(metricDistribution(records, "ttfr")).toEqual({
      count: 5,
      median: 30,
      p90: 50,
    });
  });

  it("also summarizes TTSec (PR-I, I.3)", () => {
    const records = [5, 15, 25, null].map(record);
    expect(metricDistribution(records, "ttSec")).toEqual({
      count: 3,
      median: 15,
      p90: 25,
    });
  });
});
