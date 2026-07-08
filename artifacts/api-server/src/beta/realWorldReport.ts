import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findDataSubdir } from "../lib/dataPath";
import { getKnowledgeRuntimeStatus } from "../knowledge/dbRuntime";
import type { RuntimeKnowledgeSource } from "../knowledge/dbRuntime";
import { knowledgeSearch } from "../knowledge/search";
import {
  ScenarioFilesUnavailableError,
  type SearchScenario,
} from "./scenarios";

export const REAL_WORLD_SCENARIO_FILE = "real-world-pharmacy-scenarios.json";

export interface RecommendedMapping {
  canonicalInn: string;
  name: string;
  nameType: string;
  sourceId: string;
  reviewHint: "approved" | "pending" | "needs_review";
}

export interface RealWorldPharmacyScenario extends SearchScenario {
  tags?: string[];
  recommendedMapping?: RecommendedMapping;
}

export interface RealWorldScenarioEvaluation {
  id: string;
  query: string;
  tags: string[];
  expectedHit: boolean;
  hit: boolean;
  passed: boolean;
  resolvedStage: string;
  source: RuntimeKnowledgeSource;
  topCatalogId: string | null;
  normalizedInn: string | null;
  normalizedEnglish: string | null;
  warnings: string[];
}

export interface RealWorldPharmacyReport {
  version: "1.4-real-world";
  timestamp: string;
  totalQueries: number;
  found: number;
  missed: number;
  ambiguous: number;
  passed: number;
  failed: number;
  hitRatePct: number;
  topResultAccuracyPct: number;
  sourceDistribution: Record<RuntimeKnowledgeSource, number>;
  runtime: {
    mode: "static" | "db";
    dbConfigured: boolean;
    dbAvailable: boolean;
    staticFallbackEnabled: boolean;
  };
  recommendedMappingsToAdd: RecommendedMapping[];
  warnings: string[];
  scenarios: RealWorldScenarioEvaluation[];
}

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL("../../../../artifacts/reports/real-world-pharmacy-report.json", import.meta.url),
);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pct(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 100);
}

function emptySourceDistribution(): Record<RuntimeKnowledgeSource, number> {
  return {
    db: 0,
    static: 0,
    rxnorm: 0,
    openfda: 0,
    gemini: 0,
    fallback: 0,
  };
}

function assertRealWorldScenarioFile(
  value: unknown,
): asserts value is { scenarios: RealWorldPharmacyScenario[] } {
  if (!isObject(value)) {
    throw new Error("Real-world scenario file must be an object.");
  }
  if (value.category !== "search") {
    throw new Error("Real-world scenario file category must be search.");
  }
  if (!Array.isArray(value.scenarios)) {
    throw new Error("Real-world scenario file must contain scenarios[].");
  }
}

export async function loadRealWorldPharmacyScenarios(
  directory = findDataSubdir("test-scenarios", { moduleUrl: import.meta.url }),
): Promise<RealWorldPharmacyScenario[]> {
  if (!directory) throw new ScenarioFilesUnavailableError();
  let raw: string;
  try {
    raw = await readFile(join(directory, REAL_WORLD_SCENARIO_FILE), "utf8");
  } catch {
    throw new ScenarioFilesUnavailableError();
  }
  const parsed: unknown = JSON.parse(raw);
  assertRealWorldScenarioFile(parsed);
  return parsed.scenarios;
}

function normalizedMatches(scenario: SearchScenario, inn: string | null, english: string | null): boolean {
  const innOk =
    scenario.expected.normalizedInn === undefined ||
    scenario.expected.normalizedInn === inn;
  const englishOk =
    scenario.expected.normalizedEnglish === undefined ||
    scenario.expected.normalizedEnglish === english;
  return innOk && englishOk;
}

function recommendationForMiss(scenario: RealWorldPharmacyScenario): RecommendedMapping {
  return scenario.recommendedMapping ?? {
    canonicalInn: scenario.expected.normalizedInn ?? "needs-review",
    name: scenario.query,
    nameType: "synonym",
    sourceId: "manual_review_candidate",
    reviewHint: "pending",
  };
}

export async function buildRealWorldPharmacyReport(
  scenarios?: RealWorldPharmacyScenario[],
): Promise<RealWorldPharmacyReport> {
  const searchScenarios = scenarios ?? (await loadRealWorldPharmacyScenarios());
  const sourceDistribution = emptySourceDistribution();
  const evaluations: RealWorldScenarioEvaluation[] = [];
  const recommended = new Map<string, RecommendedMapping>();

  let found = 0;
  let missed = 0;
  let ambiguous = 0;
  let passed = 0;
  let topExpected = 0;
  let topCorrect = 0;

  for (const scenario of searchScenarios) {
    const result = await knowledgeSearch(scenario.query, { skipExternal: true });
    const hit = result.normalized !== null || result.catalogMatches.length > 0;
    const topCatalogId = result.catalogMatches[0]?.id ?? null;
    const normalizedInn = result.normalized?.inn ?? null;
    const normalizedEnglish = result.normalized?.english ?? null;
    const warnings: string[] = [];

    sourceDistribution[result.source] += 1;
    if (hit) found += 1;
    if (scenario.expected.hit && !hit) {
      missed += 1;
      const next = recommendationForMiss(scenario);
      recommended.set(`${next.canonicalInn}::${next.name}`, next);
      warnings.push("Expected real-world query was not resolved locally.");
    }
    if (result.catalogMatches.length > 1) ambiguous += 1;
    if (scenario.expected.topCatalogId !== undefined) {
      topExpected += 1;
      if (topCatalogId === scenario.expected.topCatalogId) topCorrect += 1;
    }

    const scenarioPassed =
      scenario.expected.hit === hit &&
      (scenario.expected.topCatalogId === undefined ||
        topCatalogId === scenario.expected.topCatalogId) &&
      normalizedMatches(scenario, normalizedInn, normalizedEnglish);
    if (scenarioPassed) passed += 1;

    evaluations.push({
      id: scenario.id,
      query: scenario.query,
      tags: scenario.tags ?? [],
      expectedHit: scenario.expected.hit,
      hit,
      passed: scenarioPassed,
      resolvedStage: result.resolvedStage,
      source: result.source,
      topCatalogId,
      normalizedInn,
      normalizedEnglish,
      warnings,
    });
  }

  const runtime = await getKnowledgeRuntimeStatus();
  const recommendedMappingsToAdd = [...recommended.values()];

  return {
    version: "1.4-real-world",
    timestamp: new Date().toISOString(),
    totalQueries: searchScenarios.length,
    found,
    missed,
    ambiguous,
    passed,
    failed: searchScenarios.length - passed,
    hitRatePct: pct(found, searchScenarios.length),
    topResultAccuracyPct: pct(topCorrect, topExpected),
    sourceDistribution,
    runtime: {
      mode: runtime.runtimeMode,
      dbConfigured: runtime.databaseUrlConfigured,
      dbAvailable: runtime.dbAvailable,
      staticFallbackEnabled: runtime.staticFallbackEnabled,
    },
    recommendedMappingsToAdd,
    warnings: [
      "External providers are skipped in real-world beta reports; local DB/static runtime is evaluated instead.",
      ...(recommendedMappingsToAdd.length > 0
        ? ["Recommended mappings must pass review policy before runtime use."]
        : []),
    ],
    scenarios: evaluations,
  };
}

export async function writeRealWorldPharmacyReport(
  path = DEFAULT_REPORT_PATH,
): Promise<void> {
  const report = await buildRealWorldPharmacyReport();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

export { DEFAULT_REPORT_PATH as DEFAULT_REAL_WORLD_PHARMACY_REPORT_PATH };
