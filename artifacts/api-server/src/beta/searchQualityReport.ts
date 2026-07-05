import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { knowledgeSearch } from "../knowledge/search";
import type { RuntimeKnowledgeSource } from "../knowledge/dbRuntime";
import {
  loadBetaScenarioSet,
  type SearchScenario,
} from "./scenarios";

export interface SearchScenarioEvaluation {
  id: string;
  query: string;
  expectedHit: boolean;
  hit: boolean;
  resolvedStage: string;
  source: RuntimeKnowledgeSource;
  topCatalogId: string | null;
  normalizedInn: string | null;
  normalizedEnglish: string | null;
  warnings: string[];
}

export interface SearchQualityReport {
  version: "1.0-beta";
  timestamp: string;
  totalQueries: number;
  hitRatePct: number;
  topResultAccuracyPct: number;
  normalizationSuccessRatePct: number;
  ukrainianQueryCoveragePct: number;
  fallbackSourceDistribution: Record<RuntimeKnowledgeSource, number>;
  misses: SearchScenarioEvaluation[];
  ambiguousQueries: {
    id: string;
    query: string;
    catalogMatches: string[];
  }[];
  recommendedDictionaryAdditions: {
    query: string;
    reason: string;
  }[];
  warnings: string[];
  scenarios: SearchScenarioEvaluation[];
}

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL("../../../../artifacts/reports/search-quality-report.json", import.meta.url),
);

function pct(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 100);
}

function hasCyrillic(value: string): boolean {
  return /[А-Яа-яІіЇїЄєҐґ]/.test(value);
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

export async function buildSearchQualityReport(
  scenarios?: SearchScenario[],
): Promise<SearchQualityReport> {
  const searchScenarios = scenarios ?? (await loadBetaScenarioSet()).search;
  const sourceDistribution = emptySourceDistribution();
  const evaluations: SearchScenarioEvaluation[] = [];
  const ambiguousQueries: SearchQualityReport["ambiguousQueries"] = [];

  let expectedHits = 0;
  let hits = 0;
  let topExpected = 0;
  let topCorrect = 0;
  let normalizationExpected = 0;
  let normalizationCorrect = 0;
  let ukrainianQueries = 0;

  for (const scenario of searchScenarios) {
    const result = await knowledgeSearch(scenario.query, { skipExternal: true });
    const hit = result.normalized !== null || result.catalogMatches.length > 0;
    const topCatalogId = result.catalogMatches[0]?.id ?? null;
    const normalizedInn = result.normalized?.inn ?? null;
    const normalizedEnglish = result.normalized?.english ?? null;
    const warnings: string[] = [];

    sourceDistribution[result.source] += 1;
    if (scenario.expected.hit) expectedHits += 1;
    if (scenario.expected.hit && hit) hits += 1;

    if (scenario.expected.topCatalogId !== undefined) {
      topExpected += 1;
      if (topCatalogId === scenario.expected.topCatalogId) topCorrect += 1;
    }
    if (
      scenario.expected.normalizedInn !== undefined ||
      scenario.expected.normalizedEnglish !== undefined
    ) {
      normalizationExpected += 1;
      const innOk =
        scenario.expected.normalizedInn === undefined ||
        normalizedInn === scenario.expected.normalizedInn;
      const englishOk =
        scenario.expected.normalizedEnglish === undefined ||
        normalizedEnglish === scenario.expected.normalizedEnglish;
      if (innOk && englishOk) normalizationCorrect += 1;
    }
    if (hasCyrillic(scenario.query)) ukrainianQueries += 1;
    if (result.resolvedStage === "ai") {
      warnings.push("No local/static hit; UI should offer safe fallback.");
    }
    if (result.catalogMatches.length > 1) {
      ambiguousQueries.push({
        id: scenario.id,
        query: scenario.query,
        catalogMatches: result.catalogMatches.map((drug) => drug.id),
      });
    }

    evaluations.push({
      id: scenario.id,
      query: scenario.query,
      expectedHit: scenario.expected.hit,
      hit,
      resolvedStage: result.resolvedStage,
      source: result.source,
      topCatalogId,
      normalizedInn,
      normalizedEnglish,
      warnings,
    });
  }

  const misses = evaluations.filter(
    (evaluation) => evaluation.expectedHit && !evaluation.hit,
  );
  const recommendedDictionaryAdditions = misses.map((miss) => ({
    query: miss.query,
    reason: "Expected beta workflow hit was not resolved by dictionary or local catalog.",
  }));

  return {
    version: "1.0-beta",
    timestamp: new Date().toISOString(),
    totalQueries: searchScenarios.length,
    hitRatePct: pct(hits, expectedHits),
    topResultAccuracyPct: pct(topCorrect, topExpected),
    normalizationSuccessRatePct: pct(normalizationCorrect, normalizationExpected),
    ukrainianQueryCoveragePct: pct(ukrainianQueries, searchScenarios.length),
    fallbackSourceDistribution: sourceDistribution,
    misses,
    ambiguousQueries,
    recommendedDictionaryAdditions,
    warnings: [
      "External search providers are skipped in CI; static/local fallback is used for this report.",
      ...evaluations.flatMap((evaluation) => evaluation.warnings),
    ],
    scenarios: evaluations,
  };
}

export async function writeSearchQualityReport(
  path = DEFAULT_REPORT_PATH,
): Promise<void> {
  const report = await buildSearchQualityReport();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

export { DEFAULT_REPORT_PATH as DEFAULT_SEARCH_QUALITY_REPORT_PATH };

