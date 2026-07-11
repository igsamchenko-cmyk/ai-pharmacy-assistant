import { describe, expect, it } from "vitest";
import type { BetaDashboardStatus } from "@workspace/api-client-react";
import {
  buildDashboardProductionSummary,
  EXTERNAL_PROVIDER_NOTICE,
} from "./beta-dashboard-summary";

const productionStatus: BetaDashboardStatus = {
  generatedAt: "2026-07-11T00:00:00.000Z",
  status: "warning",
  readiness: {
    score: 96,
    ready: true,
    summary: "Ready",
    warnings: [
      "External providers are skipped in beta scenarios; static/local fallback is evaluated instead.",
    ],
  },
  scenarios: { passed: 24, failed: 0, total: 24, warnings: [] },
  searchQuality: { totalQueries: 7, hitRatePct: 100, topResultAccuracyPct: 100, missesCount: 0, warnings: [] },
  realWorld: { total: 39, passed: 37, missed: 2, recommendedAdditions: 2, hitRatePct: 95, warnings: [] },
  ingestion: {
    sourcesApproved: 3,
    registryRawRows: 16533,
    registryProducts: 16533,
    registryIngredients: 1348,
    registryManufacturers: 22888,
    registryRegistrations: 14769,
    candidateFiles: 13,
    candidateRows: 34,
    approved: 1939,
    pending: 0,
    needsReview: 0,
    rejected: 0,
    conflicts: 47,
    ok: true,
    warnings: [],
  },
  runtime: { mode: "db", dbConfigured: true, dbAvailable: true, staticFallbackEnabled: true, warnings: [] },
  dataQuality: { mappingsCount: 756, sourceCoveragePct: 100, atcCoveragePct: 100, conflicts: 47, ok: true, warnings: [] },
  reviewQueue: { pending: 0, needsReview: 0, approved: 1939, rejected: 0, warnings: [] },
  diagnostics: { releaseLabel: "v1.6.0 - Ukrainian Registry Database Scaling", version: "v1.6.0", warnings: [] },
};

describe("Dashboard production summary", () => {
  it("shows release and verified production counts", () => {
    const summary = buildDashboardProductionSummary(productionStatus);

    expect(summary.release).toBe("v1.6.0");
    expect(summary.release).not.toBe("0.0.0");
    expect(summary.products).toBe(16533);
    expect(summary.approvedMappings).toBe(1939);
    expect(summary.registrations).toBe(14769);
    expect(summary.runtime).toBe("PostgreSQL");
    expect(summary.databaseReady).toBe(true);
  });

  it("keeps report warnings separate from production blockers", () => {
    const summary = buildDashboardProductionSummary(productionStatus);

    expect(summary.blockers).toEqual([]);
    expect(summary.reportNotices).toContain(EXTERNAL_PROVIDER_NOTICE);
  });
});
