import { beforeAll, describe, expect, it } from "vitest";
import {
  buildBetaReadinessReport,
  type BetaReadinessReport,
} from "../readiness";

describe("closed beta readiness report", () => {
  let report: BetaReadinessReport;

  beforeAll(async () => {
    report = await buildBetaReadinessReport();
  });

  it("summarizes the requested readiness commands", () => {
    expect(report.commands.map((item) => item.command)).toEqual([
      "knowledge:import:preview:all",
      "knowledge:import:validate:all",
      "knowledge:backfill",
      "knowledge:runtime:verify",
      "knowledge:quality:report",
      "knowledge:search:report",
      "beta:scenarios",
    ]);
  });

  it("does not require a real DB to report static fallback readiness", () => {
    expect(report.staticFallbackReady).toBe(true);
    expect(report.warnings.join(" ")).toContain("static fallback");
  });

  it("includes scenario and search quality summaries", () => {
    expect(report.scenarios.passed).toBeGreaterThan(0);
    expect(report.searchQuality.totalQueries).toBeGreaterThan(0);
  });

  it("computes a bounded readiness score", () => {
    expect(report.readinessScore).toBeGreaterThanOrEqual(0);
    expect(report.readinessScore).toBeLessThanOrEqual(100);
  });

  it("records closed beta limitations", () => {
    expect(report.knownLimitations.join(" ")).toContain("clinically complete");
  });
});

