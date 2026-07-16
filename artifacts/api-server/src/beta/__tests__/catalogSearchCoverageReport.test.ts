import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "../../knowledge/dictionary";
import type {
  RegistryParseResult,
  RegistryRawRow,
} from "../../knowledge/ingestion/registry";
import {
  CATALOG_SEARCH_COVERAGE_QUOTAS,
  type CatalogSearchCoverageReport,
  REQUIRED_CATALOG_SEARCH_NAMES,
  buildCatalogSearchCoverageReport,
} from "../catalogSearchCoverageReport";

function registryRow(
  index: number,
  tradeName: string,
  inn: string,
  parsedIngredients = [inn],
): RegistryRawRow {
  const combinationProduct = parsedIngredients.length > 1;
  return {
    registryId: `registry-${String(index).padStart(4, "0")}`,
    tradeName,
    inn,
    activeIngredient: parsedIngredients.join(" + "),
    ingredientParse: {
      rawIngredientExpression: parsedIngredients.join(" + "),
      parsedIngredients,
      ingredientCount: parsedIngredients.length,
      combinationProduct,
      parseConfidence: "high",
      parseWarnings: [],
      baseIngredientCandidates: parsedIngredients,
      saltOrDerivativeFlags: [],
    },
    atcCode: combinationProduct ? "C01AA01" : "A01AA01",
    form: "таблетки",
    strength: "",
    applicantName: "Тестовий заявник",
    applicantCountry: "Україна",
    manufacturer: "Тестовий виробник",
    country: "Україна",
    manufacturers: [{ name: "Тестовий виробник", country: "Україна" }],
    registrationNumber: `UA/TEST/${String(index).padStart(4, "0")}`,
    registrationStartDate: "2025-01-01",
    registrationEndDate: "необмежений",
    status: "active",
    earlyTermination: "",
    instructionUrl: "",
    sourceId: "ukraine_state_drug_registry",
    rawIndex: index,
    warnings: combinationProduct ? ["combination_or_multi_ingredient"] : [],
  };
}

function fixture(): {
  registry: RegistryParseResult;
  dictionaryEntries: DictionaryEntry[];
} {
  const rows: RegistryRawRow[] = [];
  let index = 1;
  for (const [mandatoryIndex, name] of REQUIRED_CATALOG_SEARCH_NAMES.entries()) {
    rows.push(registryRow(
      index++,
      name.toLocaleUpperCase("uk-UA"),
      `Обов'язкова речовина ${mandatoryIndex + 1}`,
    ));
  }
  for (let value = 1; value <= 70; value += 1) {
    rows.push(registryRow(
      index++,
      `ТЕСТОВИЙ®-ПРЕПАРАТ-${value}`,
      `Речовина ${value}`,
    ));
  }
  for (let value = 1; value <= 25; value += 1) {
    rows.push(registryRow(
      index++,
      `КОМБІ®-ПРЕПАРАТ-${value}`,
      `Речовина ${value} + Компонент ${value}`,
      [`Речовина ${value}`, `Компонент ${value}`],
    ));
  }

  const dictionaryEntries: DictionaryEntry[] = Array.from(
    { length: 30 },
    (_, offset) => ({
      name: `Довідковий бренд ${offset + 1}`,
      kind: "synonym" as const,
      ingredient: {
        inn: `Речовина ${offset + 1}`,
        latin: `Substantia ${offset + 1}`,
        english: `Substance ${offset + 1}`,
        atc: "A01AA01",
        group: "Тестова група",
      },
      provenance: {
        sourceKey: "pharmacology-reference",
        evidenceLevel: "reference" as const,
      },
    }),
  );

  return {
    registry: {
      version: "1.6-registry-production",
      sourceId: "ukraine_state_drug_registry",
      fileName: "reestr.csv",
      delimiter: ",",
      snapshot: {
        sourceUrl: "https://example.test/official.csv",
        downloadedAt: "2026-07-15T00:00:00.000Z",
        contentLength: 123,
        sha256: "a".repeat(64),
        encoding: "utf-8",
        format: "csv",
        fileName: "reestr.csv",
      },
      rawRows: rows.length,
      parsedRows: rows.length,
      generatedCandidates: 0,
      parseErrors: [],
      warnings: [],
      rows,
      candidates: [],
    },
    dictionaryEntries,
  };
}

describe("catalog search coverage report", () => {
  it("builds exactly 160 deterministic provenance-backed cases with fixed quotas", () => {
    const input = fixture();
    const first = buildCatalogSearchCoverageReport(input.registry, {
      dictionaryEntries: input.dictionaryEntries,
    });
    const second = buildCatalogSearchCoverageReport(input.registry, {
      dictionaryEntries: input.dictionaryEntries,
    });

    expect(first.summary.totalCases).toBe(160);
    expect(first).toEqual(second);
    expect(new Set(first.cases.map((item) => item.id)).size).toBe(160);
    expect(first.summary.provenanceBackedCases).toBe(160);
    expect(first.summary.registryTargetPresent).toBe(160);
    expect(first.summary.afterCovered).toBe(160);
    expect(first.summary.afterMisses).toBe(0);
    for (const [category, quota] of Object.entries(CATALOG_SEARCH_COVERAGE_QUOTAS)) {
      expect(first.summary.byCategory[
        category as keyof typeof CATALOG_SEARCH_COVERAGE_QUOTAS
      ].total).toBe(quota);
    }
  });

  it("keeps the committed artifact compact, deterministic, and array-bounded", () => {
    const path = fileURLToPath(
      new URL("../../../../reports/catalog-search-coverage-report.json", import.meta.url),
    );
    const raw = readFileSync(path, "utf8");
    const report = JSON.parse(raw) as CatalogSearchCoverageReport;

    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(150 * 1024);
    expect(report).not.toHaveProperty("generatedAt");
    expect(report.source).not.toHaveProperty("downloadedAt");

    function collectArrays(value: unknown): unknown[][] {
      if (Array.isArray(value)) {
        return [value, ...value.flatMap((item) => collectArrays(item))];
      }
      if (value && typeof value === "object") {
        return Object.values(value).flatMap((item) => collectArrays(item));
      }
      return [];
    }

    for (const item of report.cases) {
      expect(item.provenance.registryTargetCount).toBeGreaterThan(0);
      expect(item.provenance.registryTargetIdentitySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(item.provenance.sampleRegistryIds.length).toBeLessThanOrEqual(5);
      expect(item.provenance.sampleRegistrationNumbers.length).toBeLessThanOrEqual(5);
      expect(item.provenance).not.toHaveProperty("registryIds");
      expect(item.provenance).not.toHaveProperty("registrationNumbers");
      for (const array of collectArrays(item)) {
        expect(array.length).toBeLessThanOrEqual(8);
      }
    }
  });
  it("pins every mandatory query and keeps alias provenance explicit", () => {
    const input = fixture();
    const report = buildCatalogSearchCoverageReport(input.registry, {
      dictionaryEntries: input.dictionaryEntries,
    });
    const mandatory = new Set(
      report.cases.filter((item) => item.mandatory).map((item) => item.query.toLowerCase()),
    );
    for (const name of REQUIRED_CATALOG_SEARCH_NAMES) {
      expect(mandatory.has(name)).toBe(true);
    }
    const aliases = report.cases.filter((item) => item.category === "approved_alias");
    expect(aliases).toHaveLength(15);
    expect(aliases.every(
      (item) => item.provenance.dictionary?.reviewState === "runtime_static",
    )).toBe(true);
    expect(report.aliasSelection.selected).toBe(15);
  });

  it("reports trademark-only structural misses without promoting a new alias", () => {
    const input = fixture();
    const report = buildCatalogSearchCoverageReport(input.registry, {
      dictionaryEntries: input.dictionaryEntries,
    });
    const punctuationMiss = report.cases.find(
      (item) => item.category === "punctuation_case" &&
        item.missReason === "punctuation_or_trademark_not_normalized",
    );
    expect(punctuationMiss).toBeDefined();
    expect(punctuationMiss?.structuralCoverage.before).toBe(false);
    expect(punctuationMiss?.structuralCoverage.after).toBe(true);
    expect(punctuationMiss?.provenance.primarySourceKey).toBe(
      "ukraine_state_drug_registry",
    );
    expect(report.policy.notes.join(" ")).toContain("not approved aliases");
  });
});
