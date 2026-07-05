import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { backfillCounts, buildStaticBackfillSnapshot } from "../knowledge/backfill";
import { buildDictionaryBatchSummary } from "../knowledge/import/batches";
import { buildKnowledgeQualityJsonReport } from "../knowledge/qualityReport";
import { verifyKnowledgeRuntime } from "../knowledge/runtimeVerify";
import { validateKnowledge } from "../knowledge/validation";
import { runBetaScenarios, type BetaScenarioRunReport } from "./scenarios";
import {
  buildSearchQualityReport,
  type SearchQualityReport,
} from "./searchQualityReport";

export interface ReadinessCommandStatus {
  command: string;
  ok: boolean;
  summary: string;
}

export interface BetaReadinessReport {
  version: "1.0-beta";
  timestamp: string;
  readinessScore: number;
  readyToMerge: boolean;
  runtimeMode: "static" | "db";
  staticFallbackReady: boolean;
  databaseUrlConfigured: boolean;
  commands: ReadinessCommandStatus[];
  hardBlockers: string[];
  warnings: string[];
  knownLimitations: string[];
  recommendedNextActions: string[];
  searchQuality: Pick<
    SearchQualityReport,
    | "totalQueries"
    | "hitRatePct"
    | "topResultAccuracyPct"
    | "normalizationSuccessRatePct"
    | "misses"
    | "recommendedDictionaryAdditions"
  >;
  scenarios: Pick<
    BetaScenarioRunReport,
    "ok" | "passed" | "failed" | "categoryCoverage"
  >;
}

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL("../../../../artifacts/reports/beta-readiness-report.json", import.meta.url),
);

function scoreReadiness(checks: boolean[], warningCount: number): number {
  const base = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return Math.max(0, Math.min(100, base - Math.min(10, warningCount)));
}

function command(command: string, ok: boolean, summary: string): ReadinessCommandStatus {
  return { command, ok, summary };
}

export async function buildBetaReadinessReport(): Promise<BetaReadinessReport> {
  const validation = validateKnowledge();
  const batchSummary = buildDictionaryBatchSummary();
  const snapshot = buildStaticBackfillSnapshot();
  const counts = backfillCounts(snapshot);
  const runtime = await verifyKnowledgeRuntime();
  const quality = await buildKnowledgeQualityJsonReport();
  const searchQuality = await buildSearchQualityReport();
  const scenarios = await runBetaScenarios();

  const commands = [
    command(
      "knowledge:import:preview:all",
      batchSummary.wouldSucceed,
      `${batchSummary.files} batch files, ${batchSummary.totalRows} rows, ${batchSummary.conflicts} conflicts.`,
    ),
    command(
      "knowledge:import:validate:all",
      batchSummary.wouldSucceed,
      `${batchSummary.sourceCoveragePct}% source coverage, ${batchSummary.ukrainianCoveragePct}% Ukrainian coverage.`,
    ),
    command(
      "knowledge:backfill",
      counts.names > 0 && counts.ingredients > 0,
      `${counts.names} mappings, ${counts.ingredients} ingredients in static snapshot.`,
    ),
    command(
      "knowledge:runtime:verify",
      runtime.ok,
      runtime.databaseUrlConfigured
        ? "DB URL configured; runtime verification completed."
        : "DB absent; static snapshot simulation and fallback verification completed.",
    ),
    command(
      "knowledge:quality:report",
      quality.validation.ok,
      `${quality.coverage.mappingProvenancePct}% mapping provenance, ${quality.coverage.approvedMappingPct}% approved mappings.`,
    ),
    command(
      "knowledge:search:report",
      searchQuality.misses.length === 0,
      `${searchQuality.hitRatePct}% hit rate, ${searchQuality.topResultAccuracyPct}% top-result accuracy.`,
    ),
    command(
      "beta:scenarios",
      scenarios.ok,
      `${scenarios.passed} passed, ${scenarios.failed} failed.`,
    ),
  ];

  const hardBlockers: string[] = [];
  if (!validation.ok) hardBlockers.push("Knowledge validation has errors.");
  if (!runtime.ok) hardBlockers.push("Runtime verification failed.");
  if (!quality.validation.ok) hardBlockers.push("Knowledge quality report has validation errors.");
  if (searchQuality.misses.length > 0) hardBlockers.push("Expected beta search scenarios missed.");
  if (!scenarios.ok) hardBlockers.push("Beta scenario validation failed.");
  if (!runtime.status.staticFallbackEnabled) hardBlockers.push("Static fallback is not enabled.");

  const warnings = [
    ...validation.warnings.map((warning) => warning.message),
    ...runtime.warnings,
    ...quality.warnings,
    ...searchQuality.warnings,
    ...scenarios.warnings,
  ];

  if (!runtime.databaseUrlConfigured) {
    warnings.push("DATABASE_URL is not configured; readiness is for static fallback mode.");
  }

  const knownLimitations = [
    "Closed beta uses demo/reference data and curated dictionary batches; it is not clinically complete.",
    "DB runtime remains optional behind KNOWLEDGE_DB_RUNTIME=true.",
    "External providers may be unavailable in CI; static/local fallback is expected.",
    "Feedback is local-only unless a future backend endpoint is explicitly added.",
  ];

  const recommendedNextActions = hardBlockers.length > 0
    ? [
        "Fix hard blockers before tagging v1.0.",
        "Re-run pnpm beta:readiness after fixes.",
      ]
    : [
        "Run the full validation command list on the release branch.",
        "Create the v1.0 tag only after closed beta operators review the checklist.",
      ];

  const readinessScore = scoreReadiness(
    [
      validation.ok,
      batchSummary.wouldSucceed,
      runtime.ok,
      quality.validation.ok,
      searchQuality.misses.length === 0,
      scenarios.ok,
      runtime.status.staticFallbackEnabled,
    ],
    warnings.length,
  );

  return {
    version: "1.0-beta",
    timestamp: new Date().toISOString(),
    readinessScore,
    readyToMerge: hardBlockers.length === 0 && readinessScore >= 85,
    runtimeMode: runtime.status.runtimeMode,
    staticFallbackReady: runtime.status.staticFallbackEnabled,
    databaseUrlConfigured: runtime.databaseUrlConfigured,
    commands,
    hardBlockers,
    warnings: [...new Set(warnings)],
    knownLimitations,
    recommendedNextActions,
    searchQuality: {
      totalQueries: searchQuality.totalQueries,
      hitRatePct: searchQuality.hitRatePct,
      topResultAccuracyPct: searchQuality.topResultAccuracyPct,
      normalizationSuccessRatePct: searchQuality.normalizationSuccessRatePct,
      misses: searchQuality.misses,
      recommendedDictionaryAdditions:
        searchQuality.recommendedDictionaryAdditions,
    },
    scenarios: {
      ok: scenarios.ok,
      passed: scenarios.passed,
      failed: scenarios.failed,
      categoryCoverage: scenarios.categoryCoverage,
    },
  };
}

export async function writeBetaReadinessReport(
  path = DEFAULT_REPORT_PATH,
): Promise<void> {
  const report = await buildBetaReadinessReport();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

export { DEFAULT_REPORT_PATH as DEFAULT_BETA_READINESS_REPORT_PATH };

