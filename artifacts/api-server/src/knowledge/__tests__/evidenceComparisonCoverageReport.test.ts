import { describe, expect, it } from "vitest";
import {
  buildEvidenceComparisonCoverageReport,
  parseEvidenceRegistryIndex,
  renderEvidenceComparisonCoverageReport,
} from "../evidenceComparisonCoverageReport";
import type {
  RegistryParseResult,
  RegistryRawRow,
} from "../ingestion/registry";

function row(inn: string, atcCode: string, rawIndex: number): RegistryRawRow {
  return {
    registryId: `row-${rawIndex}`,
    tradeName: `Trade ${rawIndex}`,
    inn,
    activeIngredient: inn,
    ingredientParse: {
      rawIngredientExpression: inn,
      parsedIngredients: [inn],
      ingredientCount: 1,
      combinationProduct: false,
      parseConfidence: "high",
      parseWarnings: [],
      baseIngredientCandidates: [inn],
      saltOrDerivativeFlags: [],
    },
    atcCode,
    form: "tablets",
    strength: "10 mg",
    applicantName: "Applicant",
    applicantCountry: "UA",
    manufacturer: "Manufacturer",
    country: "UA",
    manufacturers: [{ name: "Manufacturer", country: "UA" }],
    registrationNumber: `UA/${rawIndex}/01/01`,
    registrationStartDate: "2025-01-01",
    registrationEndDate: "2030-01-01",
    status: "",
    earlyTermination: "",
    instructionUrl: "",
    sourceId: "test",
    rawIndex,
    warnings: [],
  };
}

function registry(): RegistryParseResult {
  const rows = [
    row("Ingredient A", "A01AA01", 1),
    row("Ingredient B", "A01AA02", 2),
    row("Ingredient C", "B02BB01; invalid", 3),
  ];
  return {
    version: "1.6-registry-production",
    sourceId: "test",
    fileName: "reestr.csv",
    delimiter: ";",
    snapshot: {
      sourceUrl: null,
      downloadedAt: null,
      contentLength: 100,
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
  };
}

const index = parseEvidenceRegistryIndex({
  schemaVersion: "evidence-comparison-registry-index-v1",
  records: [
    {
      id: "a-b",
      comparatorInnKeys: ["Ingredient A", "Ingredient B"],
      indicationIds: ["test"],
    },
  ],
});

describe("evidence comparison coverage report", () => {
  it("derives every count from the registry rows and evidence index", () => {
    const report = buildEvidenceComparisonCoverageReport(registry(), index);
    expect(report.officialRegistry).toEqual({
      sourceSha256: "a".repeat(64),
      validRows: 3,
      invalidRows: 0,
      rowsWithValidAtc: 3,
    });
    expect(report.counts).toEqual({
      normalizedInnExpressions: 3,
      therapeuticClasses: 2,
      potentialInnPairs: 3,
      verifiedEvidenceRecords: 1,
      verifiedInnPairs: 1,
      insufficientEvidencePairs: 2,
    });
  });

  it("renders byte-identical Markdown for identical audited inputs", () => {
    const report = buildEvidenceComparisonCoverageReport(registry(), index);
    expect(renderEvidenceComparisonCoverageReport(report)).toBe(
      renderEvidenceComparisonCoverageReport(report),
    );
    expect(renderEvidenceComparisonCoverageReport(report)).not.toContain(
      "Generated:",
    );
    expect(renderEvidenceComparisonCoverageReport(report)).toContain(
      "--expected-sha256=" + "a".repeat(64),
    );
  });

  it("rejects malformed or duplicate evidence index records", () => {
    expect(() =>
      parseEvidenceRegistryIndex({ schemaVersion: "wrong", records: [] }),
    ).toThrow();
    expect(() =>
      parseEvidenceRegistryIndex({
        schemaVersion: "evidence-comparison-registry-index-v1",
        records: [
          { id: "same", comparatorInnKeys: ["a", "b"], indicationIds: ["one"] },
          { id: "same", comparatorInnKeys: ["c", "d"], indicationIds: ["two"] },
        ],
      }),
    ).toThrow(/duplicate/u);
  });
});
