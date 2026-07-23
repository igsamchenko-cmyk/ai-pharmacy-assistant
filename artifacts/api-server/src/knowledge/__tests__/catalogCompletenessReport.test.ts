import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertCatalogCompletenessReport,
  assertOfficialIngredientCoverage,
  buildCatalogCompletenessReport,
  parseRegistryText,
  type RegistrySnapshotMetadata,
} from "../ingestion";

function snapshot(downloadedAt: string): RegistrySnapshotMetadata {
  return {
    sourceUrl: "https://example.test/registry.csv",
    downloadedAt,
    contentLength: 123,
    sha256: "a".repeat(64),
    encoding: "utf-8",
    format: "csv",
    fileName: "registry.csv",
  };
}

describe("catalog completeness report", () => {
  it("counts normalized names, combinations and duplicate scopes deterministically", () => {
    const csv = [
      "id,trade_name,inn,active_ingredient,form,registration_number",
      "one,Alpha Drug®,Paracetamol,Paracetamol,Tablet,UA/1/01/01",
      "two,Alpha-Drug,PARACETAMOL,Paracetamol,Tablet,UA/1/01/01",
      "three,Combo,Amlodipine and Valsartan,Amlodipine and Valsartan,Tablet,UA/3/01/01",
    ].join("\n");
    const first = buildCatalogCompletenessReport(
      parseRegistryText(csv, {
        snapshot: snapshot("2026-01-01T00:00:00.000Z"),
      }),
    );
    const second = buildCatalogCompletenessReport(
      parseRegistryText(csv, {
        snapshot: snapshot("2026-02-01T00:00:00.000Z"),
      }),
    );

    expect(first).toEqual(second);
    expect(first.counts).toMatchObject({
      registryRows: 3,
      uniqueRawTradeNames: 3,
      uniqueNormalizedTradeNames: 2,
      uniqueTradeNames: 2,
      tradeNameRowsWithTrademark: 1,
      uniqueRawTradeNamesWithTrademark: 1,
      legacyKeysCollapsedByTrademarkNormalization: 1,
      uniqueRawInnExpressions: 3,
      uniqueNormalizedInnExpressions: 2,
      importableInnRows: 2,
      uniqueRawImportableInnExpressions: 2,
      uniqueNormalizedImportableInnExpressions: 1,
      combinationRows: 1,
      uniqueCombinationSignatures: 1,
      combinationRowsWithoutSignature: 0,
      missing: {
        tradeName: 0,
        rawInn: 0,
        activeIngredient: 0,
        normalizedTradeName: 0,
        normalizedNameKey: 0,
        searchableKey: 0,
      },
    });
    expect(first.coverage).toMatchObject({
      directOwnTradeNameSearchableRows: 3,
      searchableRows: 3,
      unexplainedUnsearchableRows: 0,
      allRegistryProductsAccountedFor: true,
    });
    expect(first.duplicates.productRows).toMatchObject({
      actualDuplicateRegistryIdRows: 0,
      normalizedTradeName: { repeatedRows: 1, repeatedGroups: 1 },
      registrationNumber: { repeatedRows: 1, repeatedGroups: 1 },
      normalizedMedicineFingerprint: { repeatedRows: 1, repeatedGroups: 1 },
    });
    expect(first.duplicates.mappingCandidates.note).toContain(
      "neither count removes products",
    );
    expect(() => assertCatalogCompletenessReport(first)).not.toThrow();
    expect(() => assertOfficialIngredientCoverage(first)).not.toThrow();
  });

  it("fails closed when any official row lacks INN or active composition", () => {
    const report = buildCatalogCompletenessReport(
      parseRegistryText(
        [
          "id,trade_name,inn,active_ingredient,registration_number",
          "missing-inn,Alpha,,Ingredient A,UA/1",
          "missing-active,Beta,Ingredient B,,UA/2",
        ].join("\n"),
      ),
    );

    expect(report.counts.missing).toMatchObject({
      rawInn: 1,
      activeIngredient: 1,
    });
    expect(() => assertOfficialIngredientCoverage(report)).toThrow(
      /Official ingredient coverage failed/u,
    );
  });
  it("fails an unsearchable product without an explicit product quarantine reason", () => {
    const registry = parseRegistryText(
      [
        "id,trade_name,inn,active_ingredient,form,applicant_name,registration_number,atc_code",
        "missing-1,,,,,, ,",
      ].join("\n"),
    );
    const report = buildCatalogCompletenessReport(registry);

    expect(report.coverage).toMatchObject({
      searchableRows: 0,
      explicitlyQuarantinedUnsearchableRows: 0,
      unexplainedUnsearchableRows: 1,
      allRegistryProductsAccountedFor: false,
    });
    expect(() => assertCatalogCompletenessReport(report)).toThrow(
      /lack every searchable key/,
    );
  });

  it("accepts only an explicit product-level quarantine reason", () => {
    const registry = parseRegistryText(
      [
        "id,trade_name,inn,active_ingredient,form,applicant_name,registration_number,atc_code",
        "missing-1,,,,,, ,",
      ].join("\n"),
    );
    const report = buildCatalogCompletenessReport(registry, {
      productQuarantineReasons: {
        "missing-1": "Official source row requires manual catalog review.",
      },
    });

    expect(report.coverage).toMatchObject({
      explicitlyQuarantinedUnsearchableRows: 1,
      unexplainedUnsearchableRows: 0,
      allRegistryProductsAccountedFor: true,
    });
    expect(report.coverage.explicitlyQuarantined[0]).toEqual({
      registryId: "missing-1",
      reason: "Official source row requires manual catalog review.",
    });
    expect(() => assertCatalogCompletenessReport(report)).not.toThrow();
  });

  it("keeps the committed official snapshot counts auditable", () => {
    const artifact = JSON.parse(
      readFileSync(
        new URL(
          "../../../../../artifacts/reports/catalog-completeness-report.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    expect(artifact.source.sha256).toBe(
      "228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96",
    );
    expect(artifact.counts).toMatchObject({
      rawRows: 16_533,
      parsedRows: 16_533,
      registryRows: 16_533,
      uniqueRawTradeNames: 8_833,
      uniqueNormalizedTradeNames: 8_725,
      uniqueTradeNames: 8_725,
      tradeNameRowsWithTrademark: 4_208,
      uniqueRawTradeNamesWithTrademark: 2_223,
      legacyKeysCollapsedByTrademarkNormalization: 55,
      uniqueRawInnExpressions: 1_639,
      uniqueNormalizedInnExpressions: 1_638,
      importableInnRows: 13_373,
      uniqueRawImportableInnExpressions: 1_372,
      uniqueNormalizedImportableInnExpressions: 1_372,
      combinationRows: 2_917,
      uniqueCombinationSignatures: 259,
      combinationRowsWithoutSignature: 0,
      missing: {
        tradeName: 0,
        rawInn: 0,
        activeIngredient: 0,
        normalizedTradeName: 0,
        normalizedNameKey: 0,
        searchableKey: 0,
      },
    });
    expect(artifact.coverage).toMatchObject({
      directOwnTradeNameSearchableRows: 16_533,
      searchableRows: 16_533,
      unexplainedUnsearchableRows: 0,
      allRegistryProductsAccountedFor: true,
    });
    expect(artifact.duplicates.productRows).toMatchObject({
      actualDuplicateRegistryIdRows: 0,
      normalizedTradeName: { repeatedRows: 7_808, repeatedGroups: 3_668 },
      registrationNumber: { repeatedRows: 1_764, repeatedGroups: 1_658 },
      normalizedMedicineFingerprint: {
        repeatedRows: 1_342,
        repeatedGroups: 1_300,
      },
    });
    const mappingCandidates = artifact.duplicates.mappingCandidates;
    expect(mappingCandidates.generatedRows).toBeGreaterThanOrEqual(
      artifact.counts.registryRows,
    );
    expect(mappingCandidates.duplicateRows).toBeGreaterThanOrEqual(0);
    expect(mappingCandidates.quarantinedRows).toBeGreaterThanOrEqual(
      mappingCandidates.conflictGroups,
    );
    expect(
      mappingCandidates.duplicateRows + mappingCandidates.quarantinedRows,
    ).toBeLessThanOrEqual(mappingCandidates.generatedRows);
    expect(mappingCandidates.note).toContain(
      "neither count removes products from the registry catalog",
    );
    expect(artifact.integrity).toEqual({ ok: true, failures: [] });
  });
});
