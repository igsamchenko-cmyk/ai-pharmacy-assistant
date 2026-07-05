import { describe, expect, it } from "vitest";
import { buildSearchQualityReport } from "../searchQualityReport";

describe("search quality report", () => {
  it("summarizes total search scenario queries", async () => {
    const report = await buildSearchQualityReport([
      { id: "nurofen", query: "Нурофен", expected: { hit: true } },
    ]);
    expect(report.totalQueries).toBe(1);
    expect(report.hitRatePct).toBe(100);
  });

  it("calculates top result accuracy for expected catalog ids", async () => {
    const report = await buildSearchQualityReport([
      {
        id: "nurofen",
        query: "Нурофен",
        expected: { hit: true, topCatalogId: "nurofen-200" },
      },
    ]);
    expect(report.topResultAccuracyPct).toBe(100);
  });

  it("calculates normalization success for Ukrainian to English mapping", async () => {
    const report = await buildSearchQualityReport([
      {
        id: "amoxiclav",
        query: "Амоксиклав",
        expected: {
          hit: true,
          normalizedEnglish: "Amoxicillin + clavulanic acid",
        },
      },
    ]);
    expect(report.normalizationSuccessRatePct).toBe(100);
  });

  it("reports Ukrainian query coverage", async () => {
    const report = await buildSearchQualityReport([
      { id: "ua", query: "Парацетамол", expected: { hit: true } },
      { id: "en", query: "Warfarin", expected: { hit: true } },
    ]);
    expect(report.ukrainianQueryCoveragePct).toBe(50);
  });

  it("includes static source distribution for local fallback", async () => {
    const report = await buildSearchQualityReport([
      { id: "warfarin", query: "Warfarin", expected: { hit: true } },
    ]);
    expect(report.fallbackSourceDistribution.static).toBe(1);
  });

  it("lists misses and recommended dictionary additions", async () => {
    const report = await buildSearchQualityReport([
      {
        id: "missing",
        query: "невідомий препарат бета",
        expected: { hit: true },
      },
    ]);
    expect(report.misses).toHaveLength(1);
    expect(report.recommendedDictionaryAdditions[0].query).toBe(
      "невідомий препарат бета",
    );
  });

  it("marks ambiguous catalog queries with multiple matches", async () => {
    const report = await buildSearchQualityReport([
      { id: "ibuprofen", query: "Ібупрофен", expected: { hit: true } },
    ]);
    expect(report.ambiguousQueries[0].catalogMatches).toContain("nurofen-200");
  });

  it("keeps CI fallback warning explicit", async () => {
    const report = await buildSearchQualityReport([
      { id: "nurofen", query: "Нурофен", expected: { hit: true } },
    ]);
    expect(report.warnings[0]).toContain("External search providers are skipped");
  });
});

