import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledgeSearch, type SearchStage } from "../knowledge/search";
import { findDrugsInText } from "../services/drugService";
import { checkInteractions } from "../services/interactionService";
import { isTreatmentRequest } from "../services/safety";
import type { RiskLevel } from "../data/interactions";
import type { RuntimeKnowledgeSource } from "../knowledge/dbRuntime";
import { findDataSubdir, DATA_DIR_ENV } from "../lib/dataPath";

export type ScenarioCategory =
  | "search"
  | "interaction"
  | "safety"
  | "ocr"
  | "workflow";

export interface SearchScenario {
  id: string;
  query: string;
  description?: string;
  expected: {
    hit: boolean;
    topCatalogId?: string;
    normalizedInn?: string | null;
    normalizedEnglish?: string | null;
    resolvedStage?: SearchStage;
    source?: RuntimeKnowledgeSource;
    ukrainian?: boolean;
  };
}

export interface InteractionScenario {
  id: string;
  description?: string;
  drugIds: string[];
  expected: {
    pairCount?: number;
    severity?: RiskLevel | null;
    contains?: string;
  };
}

export interface SafetyScenario {
  id: string;
  query: string;
  expected: {
    blocked: boolean;
  };
}

export interface OcrScenario {
  id: string;
  description?: string;
  text: string;
  expected: {
    detectedName?: string | null;
    drugIds?: string[];
    containsDosage?: string;
  };
}

export type WorkflowStep =
  | {
      type: "search";
      query: string;
      expectHit?: boolean;
      expectTopCatalogId?: string;
    }
  | {
      type: "interaction";
      drugIds: string[];
      expectPairCount?: number;
      expectSeverity?: RiskLevel | null;
    }
  | {
      type: "safety";
      query: string;
      expectBlocked: boolean;
    }
  | {
      type: "ocr";
      text: string;
      expectDetectedId?: string;
    };

export interface WorkflowScenario {
  id: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface ScenarioFile<TScenario> {
  version: string;
  category: ScenarioCategory;
  scenarios: TScenario[];
}

export interface BetaScenarioSet {
  search: SearchScenario[];
  interaction: InteractionScenario[];
  safety: SafetyScenario[];
  ocr: OcrScenario[];
  workflow: WorkflowScenario[];
}

export interface ScenarioCheckResult {
  id: string;
  category: ScenarioCategory;
  passed: boolean;
  failed: string[];
  warnings: string[];
  observations: Record<string, unknown>;
}

export interface ScenarioCategoryCoverage {
  total: number;
  passed: number;
  failed: number;
}

export interface BetaScenarioRunReport {
  version: "1.0-beta";
  timestamp: string;
  ok: boolean;
  passed: number;
  failed: number;
  warnings: string[];
  providerFallback: {
    externalProvidersSkipped: boolean;
    fallbackSources: Record<string, number>;
  };
  categoryCoverage: Record<ScenarioCategory, ScenarioCategoryCoverage>;
  results: ScenarioCheckResult[];
}

export class ScenarioFilesUnavailableError extends Error {
  constructor() {
    super(
      `Scenario files unavailable. Configure ${DATA_DIR_ENV} or ensure data/test-scenarios is present.`,
    );
    this.name = "ScenarioFilesUnavailableError";
  }
}

const EMPTY_SET: BetaScenarioSet = {
  search: [],
  interaction: [],
  safety: [],
  ocr: [],
  workflow: [],
};

const CATEGORY_FILES = {
  search: "search-scenarios.json",
  interaction: "interaction-scenarios.json",
  safety: "safety-scenarios.json",
  ocr: "ocr-scenarios.json",
  workflow: "workflow-scenarios.json",
} satisfies Record<ScenarioCategory, string>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertScenarioFile<TScenario>(
  value: unknown,
  category: ScenarioCategory,
): asserts value is ScenarioFile<TScenario> {
  if (!isObject(value)) {
    throw new Error(`Scenario file for ${category} must be an object.`);
  }
  if (value.category !== category) {
    throw new Error(`Scenario file category mismatch: expected ${category}.`);
  }
  if (!Array.isArray(value.scenarios)) {
    throw new Error(`Scenario file ${category} must contain scenarios[].`);
  }
}

async function readScenarioFile<TScenario>(
  directory: string,
  category: ScenarioCategory,
): Promise<TScenario[]> {
  let raw: string;
  try {
    raw = await readFile(join(directory, CATEGORY_FILES[category]), "utf8");
  } catch {
    throw new ScenarioFilesUnavailableError();
  }
  const parsed: unknown = JSON.parse(raw);
  assertScenarioFile<TScenario>(parsed, category);
  return parsed.scenarios;
}

export async function loadBetaScenarioSet(
  directory = findDataSubdir("test-scenarios", { moduleUrl: import.meta.url }),
): Promise<BetaScenarioSet> {
  if (!directory) throw new ScenarioFilesUnavailableError();
  const [search, interaction, safety, ocr, workflow] = await Promise.all([
    readScenarioFile<SearchScenario>(directory, "search"),
    readScenarioFile<InteractionScenario>(directory, "interaction"),
    readScenarioFile<SafetyScenario>(directory, "safety"),
    readScenarioFile<OcrScenario>(directory, "ocr"),
    readScenarioFile<WorkflowScenario>(directory, "workflow"),
  ]);
  return { search, interaction, safety, ocr, workflow };
}

function failure(message: string, failed: string[]): void {
  failed.push(message);
}

function includesIgnoreCase(value: string, expected: string): boolean {
  return value.toLowerCase().includes(expected.toLowerCase());
}

function hasCyrillic(value: string): boolean {
  return /[А-Яа-яІіЇїЄєҐґ]/.test(value);
}

async function runSearchScenario(
  scenario: SearchScenario,
): Promise<ScenarioCheckResult> {
  const failed: string[] = [];
  const warnings: string[] = [];
  const result = await knowledgeSearch(scenario.query, { skipExternal: true });
  const hit = result.normalized !== null || result.catalogMatches.length > 0;
  const topCatalogId = result.catalogMatches[0]?.id ?? null;
  const normalizedInn = result.normalized?.inn ?? null;
  const normalizedEnglish = result.normalized?.english ?? null;

  if (hit !== scenario.expected.hit) {
    failure(`Expected hit=${scenario.expected.hit}, got hit=${hit}.`, failed);
  }
  if (
    scenario.expected.topCatalogId !== undefined &&
    topCatalogId !== scenario.expected.topCatalogId
  ) {
    failure(
      `Expected top catalog ${scenario.expected.topCatalogId}, got ${topCatalogId ?? "none"}.`,
      failed,
    );
  }
  if (
    scenario.expected.normalizedInn !== undefined &&
    normalizedInn !== scenario.expected.normalizedInn
  ) {
    failure(
      `Expected normalized INN ${scenario.expected.normalizedInn ?? "none"}, got ${normalizedInn ?? "none"}.`,
      failed,
    );
  }
  if (
    scenario.expected.normalizedEnglish !== undefined &&
    normalizedEnglish !== scenario.expected.normalizedEnglish
  ) {
    failure(
      `Expected normalized English ${scenario.expected.normalizedEnglish ?? "none"}, got ${normalizedEnglish ?? "none"}.`,
      failed,
    );
  }
  if (
    scenario.expected.resolvedStage !== undefined &&
    result.resolvedStage !== scenario.expected.resolvedStage
  ) {
    failure(
      `Expected stage ${scenario.expected.resolvedStage}, got ${result.resolvedStage}.`,
      failed,
    );
  }
  if (
    scenario.expected.source !== undefined &&
    result.source !== scenario.expected.source
  ) {
    failure(`Expected source ${scenario.expected.source}, got ${result.source}.`, failed);
  }
  if (
    scenario.expected.ukrainian !== undefined &&
    hasCyrillic(scenario.query) !== scenario.expected.ukrainian
  ) {
    failure(
      `Expected ukrainian=${scenario.expected.ukrainian}, got ${hasCyrillic(scenario.query)}.`,
      failed,
    );
  }
  if (result.resolvedStage === "ai") {
    warnings.push("No local/static search hit; UI should offer the safe AI/reference fallback.");
  }

  return {
    id: scenario.id,
    category: "search",
    passed: failed.length === 0,
    failed,
    warnings,
    observations: {
      query: scenario.query,
      hit,
      topCatalogId,
      resolvedStage: result.resolvedStage,
      source: result.source,
      normalizedInn,
      normalizedEnglish,
      catalogMatches: result.catalogMatches.map((drug) => drug.id),
    },
  };
}

function runInteractionScenario(
  scenario: InteractionScenario,
): ScenarioCheckResult {
  const failed: string[] = [];
  const result = checkInteractions(scenario.drugIds);
  const severity = result.pairs[0]?.riskLevel ?? null;

  if (
    scenario.expected.pairCount !== undefined &&
    result.pairs.length !== scenario.expected.pairCount
  ) {
    failure(
      `Expected ${scenario.expected.pairCount} interaction pair(s), got ${result.pairs.length}.`,
      failed,
    );
  }
  if (
    scenario.expected.severity !== undefined &&
    severity !== scenario.expected.severity
  ) {
    failure(
      `Expected severity ${scenario.expected.severity ?? "none"}, got ${severity ?? "none"}.`,
      failed,
    );
  }
  if (
    scenario.expected.contains &&
    !result.pairs.some((pair) =>
      includesIgnoreCase(
        `${pair.explanation} ${pair.whatToCheck} ${pair.whenToSeeDoctor}`,
        scenario.expected.contains ?? "",
      ),
    )
  ) {
    failure(`Expected interaction text to include "${scenario.expected.contains}".`, failed);
  }

  return {
    id: scenario.id,
    category: "interaction",
    passed: failed.length === 0,
    failed,
    warnings: [],
    observations: {
      drugIds: scenario.drugIds,
      pairCount: result.pairs.length,
      severity,
      disclaimerPresent: result.disclaimer.length > 0,
    },
  };
}

function runSafetyScenario(scenario: SafetyScenario): ScenarioCheckResult {
  const failed: string[] = [];
  const blocked = isTreatmentRequest(scenario.query);
  if (blocked !== scenario.expected.blocked) {
    failure(`Expected blocked=${scenario.expected.blocked}, got ${blocked}.`, failed);
  }
  return {
    id: scenario.id,
    category: "safety",
    passed: failed.length === 0,
    failed,
    warnings: [],
    observations: { query: scenario.query, blocked },
  };
}

function runOcrScenario(scenario: OcrScenario): ScenarioCheckResult {
  const failed: string[] = [];
  const result = findDrugsInText(scenario.text);
  const ids = result.matches.map((drug) => drug.id);

  if (
    scenario.expected.detectedName !== undefined &&
    result.detectedName !== scenario.expected.detectedName
  ) {
    failure(
      `Expected detected name ${scenario.expected.detectedName ?? "none"}, got ${result.detectedName ?? "none"}.`,
      failed,
    );
  }
  for (const expectedId of scenario.expected.drugIds ?? []) {
    if (!ids.includes(expectedId)) {
      failure(`Expected OCR match ${expectedId}, got [${ids.join(", ")}].`, failed);
    }
  }
  if (
    scenario.expected.containsDosage &&
    !includesIgnoreCase(scenario.text, scenario.expected.containsDosage)
  ) {
    failure(`Expected OCR text to contain dosage ${scenario.expected.containsDosage}.`, failed);
  }

  return {
    id: scenario.id,
    category: "ocr",
    passed: failed.length === 0,
    failed,
    warnings: [],
    observations: {
      detectedName: result.detectedName,
      drugIds: ids,
    },
  };
}

async function runWorkflowStep(
  scenarioId: string,
  index: number,
  step: WorkflowStep,
): Promise<string[]> {
  const failed: string[] = [];
  const prefix = `${scenarioId} step ${index + 1} (${step.type})`;

  if (step.type === "search") {
    const result = await knowledgeSearch(step.query, { skipExternal: true });
    const hit = result.normalized !== null || result.catalogMatches.length > 0;
    const topCatalogId = result.catalogMatches[0]?.id ?? null;
    if (step.expectHit !== undefined && hit !== step.expectHit) {
      failure(`${prefix}: expected hit=${step.expectHit}, got ${hit}.`, failed);
    }
    if (
      step.expectTopCatalogId !== undefined &&
      topCatalogId !== step.expectTopCatalogId
    ) {
      failure(
        `${prefix}: expected top catalog ${step.expectTopCatalogId}, got ${topCatalogId ?? "none"}.`,
        failed,
      );
    }
    return failed;
  }

  if (step.type === "interaction") {
    const result = checkInteractions(step.drugIds);
    const severity = result.pairs[0]?.riskLevel ?? null;
    if (
      step.expectPairCount !== undefined &&
      result.pairs.length !== step.expectPairCount
    ) {
      failure(
        `${prefix}: expected ${step.expectPairCount} interaction pair(s), got ${result.pairs.length}.`,
        failed,
      );
    }
    if (step.expectSeverity !== undefined && severity !== step.expectSeverity) {
      failure(
        `${prefix}: expected severity ${step.expectSeverity ?? "none"}, got ${severity ?? "none"}.`,
        failed,
      );
    }
    return failed;
  }

  if (step.type === "safety") {
    const blocked = isTreatmentRequest(step.query);
    if (blocked !== step.expectBlocked) {
      failure(`${prefix}: expected blocked=${step.expectBlocked}, got ${blocked}.`, failed);
    }
    return failed;
  }

  const result = findDrugsInText(step.text);
  const ids = result.matches.map((drug) => drug.id);
  if (step.expectDetectedId !== undefined && !ids.includes(step.expectDetectedId)) {
    failure(
      `${prefix}: expected OCR match ${step.expectDetectedId}, got [${ids.join(", ")}].`,
      failed,
    );
  }
  return failed;
}

async function runWorkflowScenario(
  scenario: WorkflowScenario,
): Promise<ScenarioCheckResult> {
  const failed: string[] = [];
  for (let i = 0; i < scenario.steps.length; i += 1) {
    failed.push(...(await runWorkflowStep(scenario.id, i, scenario.steps[i])));
  }
  return {
    id: scenario.id,
    category: "workflow",
    passed: failed.length === 0,
    failed,
    warnings: [],
    observations: {
      steps: scenario.steps.length,
      stepTypes: scenario.steps.map((step) => step.type),
    },
  };
}

function emptyCoverage(): Record<ScenarioCategory, ScenarioCategoryCoverage> {
  return {
    search: { total: 0, passed: 0, failed: 0 },
    interaction: { total: 0, passed: 0, failed: 0 },
    safety: { total: 0, passed: 0, failed: 0 },
    ocr: { total: 0, passed: 0, failed: 0 },
    workflow: { total: 0, passed: 0, failed: 0 },
  };
}

export async function runBetaScenarios(
  scenarioSet?: Partial<BetaScenarioSet>,
): Promise<BetaScenarioRunReport> {
  const scenarios = { ...EMPTY_SET, ...(scenarioSet ?? (await loadBetaScenarioSet())) };
  const searchResults = await Promise.all(scenarios.search.map(runSearchScenario));
  const workflowResults = await Promise.all(
    scenarios.workflow.map(runWorkflowScenario),
  );
  const results = [
    ...searchResults,
    ...scenarios.interaction.map(runInteractionScenario),
    ...scenarios.safety.map(runSafetyScenario),
    ...scenarios.ocr.map(runOcrScenario),
    ...workflowResults,
  ];
  const categoryCoverage = emptyCoverage();
  const fallbackSources: Record<string, number> = {};

  for (const result of results) {
    categoryCoverage[result.category].total += 1;
    if (result.passed) categoryCoverage[result.category].passed += 1;
    else categoryCoverage[result.category].failed += 1;

    const source = result.observations.source;
    if (typeof source === "string") {
      fallbackSources[source] = (fallbackSources[source] ?? 0) + 1;
    }
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const warnings = [
    "External providers are skipped in beta scenarios; static/local fallback is evaluated instead.",
    ...results.flatMap((result) => result.warnings),
  ];

  return {
    version: "1.0-beta",
    timestamp: new Date().toISOString(),
    ok: failed === 0,
    passed,
    failed,
    warnings: [...new Set(warnings)],
    providerFallback: {
      externalProvidersSkipped: true,
      fallbackSources,
    },
    categoryCoverage,
    results,
  };
}

