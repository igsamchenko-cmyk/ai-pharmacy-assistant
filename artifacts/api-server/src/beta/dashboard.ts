import { buildDiagnosticsPanelData } from "../diagnostics";
import { buildKnowledgeQualityJsonReport } from "../knowledge/qualityReport";
import { getKnowledgeRuntimeStatus } from "../knowledge/dbRuntime";
import { getReviewStats } from "../knowledge/reviewWorkflow";
import { buildBetaReadinessReport } from "./readiness";
import {
  loadBetaScenarioSet,
  runBetaScenarios,
  type BetaScenarioRunReport,
} from "./scenarios";
import { buildRealWorldPharmacyReport } from "./realWorldReport";
import { buildSearchQualityReport } from "./searchQualityReport";

export const BETA_DASHBOARD_CHECK_TYPES = [
  "readiness",
  "scenarios",
  "search_quality",
  "safety",
  "interactions",
  "real_world",
  "data_quality",
  "diagnostics",
  "full_safe_check",
] as const;

export type BetaDashboardCheckType = typeof BETA_DASHBOARD_CHECK_TYPES[number];
export type BetaDashboardRunStatus = "ok" | "warning" | "failed";

export interface BetaDashboardRunResult {
  checkType: BetaDashboardCheckType;
  status: BetaDashboardRunStatus;
  score: number | null;
  passed: number;
  failed: number;
  warnings: string[];
  summary: string;
  details: Record<string, unknown>;
  generatedAt: string;
  durationMs: number;
}

export interface BetaDashboardStatus {
  generatedAt: string;
  status: BetaDashboardRunStatus;
  readiness: {
    score: number;
    ready: boolean;
    summary: string;
    warnings: string[];
  };
  scenarios: {
    passed: number;
    failed: number;
    total: number;
    warnings: string[];
  };
  searchQuality: {
    totalQueries: number;
    hitRatePct: number;
    topResultAccuracyPct: number;
    missesCount: number;
    warnings: string[];
  };
  realWorld: {
    total: number;
    passed: number;
    missed: number;
    recommendedAdditions: number;
    hitRatePct: number;
    warnings: string[];
  };
  runtime: {
    mode: "static" | "db";
    dbConfigured: boolean;
    dbAvailable: boolean;
    staticFallbackEnabled: boolean;
    warnings: string[];
  };
  dataQuality: {
    mappingsCount: number;
    sourceCoveragePct: number;
    atcCoveragePct: number;
    conflicts: number;
    ok: boolean;
    warnings: string[];
  };
  reviewQueue: {
    pending: number;
    needsReview: number;
    approved: number;
    rejected: number;
    warnings: string[];
  };
  diagnostics: {
    releaseLabel: string;
    version: string;
    warnings: string[];
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;
const FULL_CHECK_TIMEOUT_MS = 25_000;

class BetaDashboardTimeoutError extends Error {
  constructor(checkType: BetaDashboardCheckType, timeoutMs: number) {
    super(`${checkType} timed out after ${timeoutMs}ms`);
    this.name = "BetaDashboardTimeoutError";
  }
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter(Boolean))];
}

function statusFor(failed: number, warnings: string[]): BetaDashboardRunStatus {
  if (failed > 0) return "failed";
  return warnings.length > 0 ? "warning" : "ok";
}

function statusFromOk(ok: boolean, warnings: string[]): BetaDashboardRunStatus {
  if (!ok) return "failed";
  return warnings.length > 0 ? "warning" : "ok";
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
      .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]");
  }
  return "Beta dashboard check failed.";
}

async function withTimeout<T>(
  checkType: BetaDashboardCheckType,
  timeoutMs: number,
  task: Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new BetaDashboardTimeoutError(checkType, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function asDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function scenarioSummary(report: BetaScenarioRunReport, label: string): string {
  return `${label}: ${report.passed} passed, ${report.failed} failed.`;
}

async function runScenarioCategory(
  checkType: "safety" | "interactions",
): Promise<BetaDashboardRunResult> {
  const set = await loadBetaScenarioSet();
  const report = checkType === "safety"
    ? await runBetaScenarios({ safety: set.safety })
    : await runBetaScenarios({ interaction: set.interaction });
  const warnings = uniqueWarnings(report.warnings);
  return {
    checkType,
    status: statusFor(report.failed, warnings),
    score: null,
    passed: report.passed,
    failed: report.failed,
    warnings,
    summary: scenarioSummary(report, checkType === "safety" ? "Safety scenarios" : "Interaction scenarios"),
    details: asDetails(report),
    generatedAt: report.timestamp,
    durationMs: 0,
  };
}

async function executeCheck(checkType: BetaDashboardCheckType): Promise<Omit<BetaDashboardRunResult, "durationMs">> {
  if (checkType === "readiness") {
    const report = await buildBetaReadinessReport();
    const failed = report.hardBlockers.length;
    const warnings = uniqueWarnings(report.warnings);
    return {
      checkType,
      status: statusFromOk(report.readyToMerge, warnings),
      score: report.readinessScore,
      passed: report.commands.filter((item) => item.ok).length,
      failed,
      warnings,
      summary: `Readiness score ${report.readinessScore}; ${report.readyToMerge ? "ready" : "not ready"} for closed beta.`,
      details: asDetails(report),
      generatedAt: report.timestamp,
    };
  }

  if (checkType === "scenarios") {
    const report = await runBetaScenarios();
    const warnings = uniqueWarnings(report.warnings);
    return {
      checkType,
      status: statusFor(report.failed, warnings),
      score: null,
      passed: report.passed,
      failed: report.failed,
      warnings,
      summary: scenarioSummary(report, "Beta scenarios"),
      details: asDetails(report),
      generatedAt: report.timestamp,
    };
  }

  if (checkType === "search_quality") {
    const report = await buildSearchQualityReport();
    const warnings = uniqueWarnings(report.warnings);
    return {
      checkType,
      status: statusFromOk(report.misses.length === 0, warnings),
      score: report.hitRatePct,
      passed: report.totalQueries - report.misses.length,
      failed: report.misses.length,
      warnings,
      summary: `Search quality: ${report.hitRatePct}% hit rate, ${report.topResultAccuracyPct}% top-result accuracy, ${report.misses.length} misses.`,
      details: asDetails(report),
      generatedAt: report.timestamp,
    };
  }

  if (checkType === "safety" || checkType === "interactions") {
    const result = await runScenarioCategory(checkType);
    const { durationMs: _durationMs, ...withoutDuration } = result;
    return withoutDuration;
  }

  if (checkType === "real_world") {
    const report = await buildRealWorldPharmacyReport();
    const warnings = uniqueWarnings([
      ...report.warnings,
      ...report.scenarios.flatMap((scenario) => scenario.warnings),
    ]);
    return {
      checkType,
      status: report.missed > 0 || warnings.length > 0 ? "warning" : "ok",
      score: report.hitRatePct,
      passed: report.passed,
      failed: report.missed,
      warnings,
      summary: `Real-world pharmacy scenarios: ${report.found}/${report.totalQueries} found, ${report.missed} missed, ${report.recommendedMappingsToAdd.length} recommended additions.`,
      details: asDetails(report),
      generatedAt: report.timestamp,
    };
  }

  if (checkType === "data_quality") {
    const report = await buildKnowledgeQualityJsonReport();
    const warnings = uniqueWarnings([
      ...report.warnings,
      ...report.validation.warnings.map((warning) => warning.message),
    ]);
    return {
      checkType,
      status: statusFromOk(report.validation.ok, warnings),
      score: report.coverage.mappingProvenancePct,
      passed: report.validation.errors.length === 0 ? 1 : 0,
      failed: report.validation.errors.length,
      warnings,
      summary: `Data quality: ${report.counts.names} mappings, ${report.coverage.sourceCoveragePct}% source coverage, ${report.dictionaryBatches.conflicts} conflicts.`,
      details: asDetails(report),
      generatedAt: report.timestamp,
    };
  }

  if (checkType === "diagnostics") {
    const [diagnostics, runtime] = await Promise.all([
      buildDiagnosticsPanelData(),
      getKnowledgeRuntimeStatus(),
    ]);
    const warnings = uniqueWarnings([...diagnostics.warnings, ...runtime.warnings]);
    return {
      checkType,
      status: statusFromOk(runtime.staticFallbackEnabled, warnings),
      score: null,
      passed: runtime.staticFallbackEnabled ? 1 : 0,
      failed: runtime.staticFallbackEnabled ? 0 : 1,
      warnings,
      summary: `Runtime ${runtime.runtimeMode}; DB ${runtime.databaseUrlConfigured ? "configured" : "not configured"}; static fallback ${runtime.staticFallbackEnabled ? "enabled" : "disabled"}.`,
      details: { diagnostics, runtime },
      generatedAt: new Date().toISOString(),
    };
  }

  const [readiness, scenarios, searchQuality, realWorld, dataQuality, diagnostics] = await Promise.all([
    buildBetaReadinessReport(),
    runBetaScenarios(),
    buildSearchQualityReport(),
    buildRealWorldPharmacyReport(),
    buildKnowledgeQualityJsonReport(),
    buildDiagnosticsPanelData(),
  ]);
  const hardFailures = [
    readiness.readyToMerge,
    scenarios.ok,
    searchQuality.misses.length === 0,
    dataQuality.validation.ok,
  ].filter((ok) => !ok).length;
  const warnings = uniqueWarnings([
    ...readiness.warnings,
    ...scenarios.warnings,
    ...searchQuality.warnings,
    ...realWorld.warnings,
    ...dataQuality.warnings,
    ...diagnostics.warnings,
  ]);
  return {
    checkType,
    status: statusFor(hardFailures, warnings),
    score: readiness.readinessScore,
    passed: readiness.commands.filter((item) => item.ok).length + scenarios.passed,
    failed:
      hardFailures +
      scenarios.failed +
      searchQuality.misses.length +
      realWorld.missed +
      dataQuality.validation.errors.length,
    warnings,
    summary: `Full safe check: readiness ${readiness.readinessScore}, scenarios ${scenarios.passed}/${scenarios.passed + scenarios.failed}, search misses ${searchQuality.misses.length}, real-world misses ${realWorld.missed}.`,
    details: { readiness, scenarios, searchQuality, realWorld, dataQuality, diagnostics },
    generatedAt: new Date().toISOString(),
  };
}

export async function runBetaDashboardCheck(
  checkType: BetaDashboardCheckType,
  timeoutMs = checkType === "full_safe_check" ? FULL_CHECK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
): Promise<BetaDashboardRunResult> {
  const started = Date.now();
  try {
    const result = await withTimeout(checkType, timeoutMs, executeCheck(checkType));
    return {
      ...result,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = stringifyError(error);
    return {
      checkType,
      status: "failed",
      score: null,
      passed: 0,
      failed: 1,
      warnings: [message],
      summary: message,
      details: {},
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    };
  }
}

export async function buildBetaDashboardStatus(): Promise<BetaDashboardStatus> {
  const [readiness, quality, diagnostics, runtime, review, realWorld] = await Promise.all([
    buildBetaReadinessReport(),
    buildKnowledgeQualityJsonReport(),
    buildDiagnosticsPanelData(),
    getKnowledgeRuntimeStatus(),
    getReviewStats(),
    buildRealWorldPharmacyReport(),
  ]);
  const warnings = uniqueWarnings([
    ...readiness.warnings,
    ...quality.warnings,
    ...diagnostics.warnings,
    ...runtime.warnings,
    ...review.warnings,
    ...realWorld.warnings,
  ]);
  return {
    generatedAt: new Date().toISOString(),
    status: statusFromOk(readiness.readyToMerge && quality.validation.ok, warnings),
    readiness: {
      score: readiness.readinessScore,
      ready: readiness.readyToMerge,
      summary: readiness.readyToMerge ? "Ready for closed beta" : "Needs review before closed beta",
      warnings: uniqueWarnings(readiness.warnings),
    },
    scenarios: {
      passed: readiness.scenarios.passed,
      failed: readiness.scenarios.failed,
      total: readiness.scenarios.passed + readiness.scenarios.failed,
      warnings: uniqueWarnings(readiness.warnings.filter((warning) => warning.includes("scenario") || warning.includes("Scenario"))),
    },
    searchQuality: {
      totalQueries: readiness.searchQuality.totalQueries,
      hitRatePct: readiness.searchQuality.hitRatePct,
      topResultAccuracyPct: readiness.searchQuality.topResultAccuracyPct,
      missesCount: readiness.searchQuality.misses.length,
      warnings: uniqueWarnings(readiness.warnings.filter((warning) => warning.includes("search") || warning.includes("Search"))),
    },
    realWorld: {
      total: realWorld.totalQueries,
      passed: realWorld.passed,
      missed: realWorld.missed,
      recommendedAdditions: realWorld.recommendedMappingsToAdd.length,
      hitRatePct: realWorld.hitRatePct,
      warnings: uniqueWarnings(realWorld.warnings),
    },
    runtime: {
      mode: runtime.runtimeMode,
      dbConfigured: runtime.databaseUrlConfigured,
      dbAvailable: runtime.dbAvailable,
      staticFallbackEnabled: runtime.staticFallbackEnabled,
      warnings: uniqueWarnings(runtime.warnings),
    },
    dataQuality: {
      mappingsCount: quality.counts.names,
      sourceCoveragePct: quality.coverage.sourceCoveragePct,
      atcCoveragePct: quality.coverage.atcCoveragePct,
      conflicts: quality.dictionaryBatches.conflicts,
      ok: quality.validation.ok,
      warnings: uniqueWarnings(quality.warnings),
    },
    reviewQueue: {
      pending: review.counts.pending,
      needsReview: review.counts.needs_review,
      approved: review.counts.approved,
      rejected: review.counts.rejected,
      warnings: uniqueWarnings(review.warnings),
    },
    diagnostics: {
      releaseLabel: diagnostics.app.releaseLabel,
      version: diagnostics.app.version,
      warnings: uniqueWarnings(diagnostics.warnings),
    },
  };
}
