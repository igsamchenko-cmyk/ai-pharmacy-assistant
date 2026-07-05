import { describe, expect, it } from "vitest";
import {
  loadBetaScenarioSet,
  runBetaScenarios,
  type BetaScenarioSet,
} from "../scenarios";

describe("closed beta scenario fixtures", () => {
  it("loads all scenario categories from data/test-scenarios", async () => {
    const scenarios = await loadBetaScenarioSet();
    expect(scenarios.search.length).toBeGreaterThan(0);
    expect(scenarios.interaction.length).toBeGreaterThan(0);
    expect(scenarios.safety.length).toBeGreaterThan(0);
    expect(scenarios.ocr.length).toBeGreaterThan(0);
    expect(scenarios.workflow.length).toBeGreaterThan(0);
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

