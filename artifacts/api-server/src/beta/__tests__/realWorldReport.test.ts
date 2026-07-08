import { describe, expect, it } from "vitest";
import {
  buildRealWorldPharmacyReport,
  loadRealWorldPharmacyScenarios,
  type RealWorldPharmacyScenario,
} from "../realWorldReport";

describe("real-world pharmacy report", () => {
  it("loads the committed real-world scenario file", async () => {
    const scenarios = await loadRealWorldPharmacyScenarios();

    expect(scenarios.length).toBeGreaterThanOrEqual(35);
    expect(scenarios.some((scenario) => scenario.tags?.includes("antibiotic"))).toBe(true);
    expect(scenarios.some((scenario) => scenario.tags?.includes("recommended-addition"))).toBe(true);
  });

  it("evaluates known and missed pharmacy queries", async () => {
    const scenarios: RealWorldPharmacyScenario[] = [
      {
        id: "known-ibuprofen",
        query: "Ibuprofen",
        expected: { hit: true, normalizedEnglish: "Ibuprofen" },
      },
      {
        id: "miss-review-candidate",
        query: "not-a-real-pharmacy-query-v14",
        expected: { hit: true },
        recommendedMapping: {
          canonicalInn: "needs-review",
          name: "not-a-real-pharmacy-query-v14",
          nameType: "synonym",
          sourceId: "manual_review_candidate",
          reviewHint: "pending",
        },
      },
    ];

    const report = await buildRealWorldPharmacyReport(scenarios);

    expect(report.totalQueries).toBe(2);
    expect(report.found).toBe(1);
    expect(report.missed).toBe(1);
    expect(report.recommendedMappingsToAdd).toHaveLength(1);
    expect(report.recommendedMappingsToAdd[0]).toMatchObject({
      canonicalInn: "needs-review",
      sourceId: "manual_review_candidate",
      reviewHint: "pending",
    });
  });

  it("keeps report payloads sanitized", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalOpenAi = process.env.OPENAI_API_KEY;
    process.env.DATABASE_URL = "postgresql://secret-user:secret-pass@example.test/db";
    process.env.GEMINI_API_KEY = "gemini-secret";
    process.env.OPENAI_API_KEY = "openai-secret";
    try {
      const report = await buildRealWorldPharmacyReport([
        {
          id: "sanitized-miss",
          query: "another-not-real-pharmacy-query-v14",
          expected: { hit: true },
        },
      ]);
      const json = JSON.stringify(report);

      expect(json).not.toContain("postgresql://");
      expect(json).not.toContain("secret-user");
      expect(json).not.toContain("secret-pass");
      expect(json).not.toContain("gemini-secret");
      expect(json).not.toContain("openai-secret");
      expect(json).not.toMatch(/[A-Za-z]:\\/);
      expect(json).not.toContain("/opt/render/project");
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalGemini;
      if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAi;
    }
  });
});
