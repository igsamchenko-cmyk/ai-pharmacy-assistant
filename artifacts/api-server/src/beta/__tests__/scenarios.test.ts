import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runBetaDashboardCheck } from "../dashboard";
import {
  loadBetaScenarioSet,
  runBetaScenarios,
  ScenarioFilesUnavailableError,
  type BetaScenarioSet,
} from "../scenarios";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../../../../..");
const API_SERVER_DIR = resolve(REPO_ROOT, "artifacts/api-server");

const MINIMAL_SCENARIO_FILES = {
  "search-scenarios.json": {
    version: "test",
    category: "search",
    scenarios: [
      {
        id: "env-search",
        query: "Нурофен",
        expected: { hit: true },
      },
    ],
  },
  "interaction-scenarios.json": {
    version: "test",
    category: "interaction",
    scenarios: [],
  },
  "safety-scenarios.json": {
    version: "test",
    category: "safety",
    scenarios: [],
  },
  "ocr-scenarios.json": {
    version: "test",
    category: "ocr",
    scenarios: [],
  },
  "workflow-scenarios.json": {
    version: "test",
    category: "workflow",
    scenarios: [],
  },
} as const;

async function createTempDataDir(
  files: Partial<typeof MINIMAL_SCENARIO_FILES> = MINIMAL_SCENARIO_FILES,
): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "farmassist-data-"));
  const scenarioDir = join(dataDir, "test-scenarios");
  await mkdir(scenarioDir, { recursive: true });
  for (const [fileName, body] of Object.entries(files)) {
    await writeFile(join(scenarioDir, fileName), JSON.stringify(body), "utf8");
  }
  return dataDir;
}

async function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

async function withCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

describe("closed beta scenario fixtures", () => {
  it("loads all scenario categories from data/test-scenarios", async () => {
    const scenarios = await loadBetaScenarioSet();
    expect(scenarios.search.length).toBeGreaterThan(0);
    expect(scenarios.interaction.length).toBeGreaterThan(0);
    expect(scenarios.safety.length).toBeGreaterThan(0);
    expect(scenarios.ocr.length).toBeGreaterThan(0);
    expect(scenarios.workflow.length).toBeGreaterThan(0);
  });

  it("resolves scenario files from the repository root", async () => {
    await withCwd(REPO_ROOT, async () => {
      const scenarios = await loadBetaScenarioSet();
      expect(scenarios.search.length).toBeGreaterThan(0);
      expect(scenarios.workflow.length).toBeGreaterThan(0);
    });
  });

  it("resolves scenario files when cwd is artifacts/api-server", async () => {
    await withCwd(API_SERVER_DIR, async () => {
      const scenarios = await loadBetaScenarioSet();
      expect(scenarios.search.length).toBeGreaterThan(0);
      expect(scenarios.interaction.length).toBeGreaterThan(0);
    });
  });

  it("supports FARMASSIST_DATA_DIR for scenario files", async () => {
    const dataDir = await createTempDataDir();
    try {
      await withEnv("FARMASSIST_DATA_DIR", dataDir, async () => {
        const scenarios = await loadBetaScenarioSet();
        expect(scenarios.search).toHaveLength(1);
        expect(scenarios.search[0].id).toBe("env-search");
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("returns a sanitized error when scenario files are missing", async () => {
    const dataDir = await createTempDataDir({
      "search-scenarios.json": MINIMAL_SCENARIO_FILES["search-scenarios.json"],
    });
    try {
      await withEnv("FARMASSIST_DATA_DIR", dataDir, async () => {
        await expect(loadBetaScenarioSet()).rejects.toBeInstanceOf(
          ScenarioFilesUnavailableError,
        );
        await expect(loadBetaScenarioSet()).rejects.not.toThrow(dataDir);
        await expect(loadBetaScenarioSet()).rejects.not.toThrow(/[A-Za-z]:\\/);
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("does not expose filesystem paths when full safe check cannot load scenarios", async () => {
    const dataDir = await createTempDataDir({
      "search-scenarios.json": MINIMAL_SCENARIO_FILES["search-scenarios.json"],
    });
    try {
      await withEnv("FARMASSIST_DATA_DIR", dataDir, async () => {
        const result = await runBetaDashboardCheck("full_safe_check");
        const json = JSON.stringify(result);
        expect(result.status).toBe("failed");
        expect(json).toContain("Scenario files unavailable");
        expect(json).not.toContain(dataDir);
        expect(json).not.toContain("/opt/render/project");
        expect(json).not.toMatch(/[A-Za-z]:\\/);
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("runs the committed beta scenarios successfully", async () => {
    const report = await runBetaScenarios();
    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(20);
  });

  it("reports category coverage for every scenario family", async () => {
    const report = await runBetaScenarios();
    expect(Object.keys(report.categoryCoverage).sort()).toEqual([
      "interaction",
      "ocr",
      "safety",
      "search",
      "workflow",
    ]);
    expect(report.categoryCoverage.search.total).toBeGreaterThan(0);
  });

  it("reports provider fallback instead of failing when external providers are skipped", async () => {
    const report = await runBetaScenarios();
    expect(report.providerFallback.externalProvidersSkipped).toBe(true);
    expect(report.warnings.join(" ")).toContain("static/local fallback");
  });

  it("validates a critical warfarin plus ibuprofen interaction scenario", async () => {
    const report = await runBetaScenarios({
      interaction: [
        {
          id: "test-critical",
          drugIds: ["warfarin-5", "ibuprofen-200"],
          expected: { severity: "critical", pairCount: 1 },
        },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.results[0].observations.severity).toBe("critical");
  });

  it("keeps allowed safety reference workflows unblocked", async () => {
    const report = await runBetaScenarios({
      safety: [
        {
          id: "test-allowed",
          query: "поясни інструкцію до препарату",
          expected: { blocked: false },
        },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.results[0].observations.blocked).toBe(false);
  });

  it("captures search misses as warnings when they are expected", async () => {
    const report = await runBetaScenarios({
      search: [
        {
          id: "test-miss",
          query: "невідомий препарат бета",
          expected: { hit: false, resolvedStage: "ai", ukrainian: true },
        },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.results[0].warnings[0]).toContain("safe AI/reference fallback");
  });

  it("fails scenarios with incorrect expected top search result", async () => {
    const report = await runBetaScenarios({
      search: [
        {
          id: "test-wrong-top",
          query: "Нурофен",
          expected: { hit: true, topCatalogId: "paracetamol-500" },
        },
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(1);
    expect(report.results[0].failed[0]).toContain("Expected top catalog");
  });

  it("validates OCR-like extracted text against local catalog matches", async () => {
    const report = await runBetaScenarios({
      ocr: [
        {
          id: "test-ocr",
          text: "Лоратадин 10 мг та Аскорбінова кислота 500 мг",
          expected: { drugIds: ["loratadine-10", "ascorbic-acid"] },
        },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.results[0].observations.drugIds).toEqual([
      "loratadine-10",
      "ascorbic-acid",
    ]);
  });

  it("reports workflow step failures with the step number", async () => {
    const scenarioSet: Partial<BetaScenarioSet> = {
      workflow: [
        {
          id: "test-workflow-failure",
          steps: [
            {
              type: "interaction",
              drugIds: ["warfarin-5", "ibuprofen-200"],
              expectSeverity: "low",
            },
          ],
        },
      ],
    };
    const report = await runBetaScenarios(scenarioSet);
    expect(report.ok).toBe(false);
    expect(report.results[0].failed[0]).toContain("step 1");
  });
});

