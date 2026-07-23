import { normalize } from "../../lib/text";
import type { RegistryRawRow, RegistryParseResult } from "./registry";
import { buildRegistryMappingPlan } from "./registryPlan";

export const CATALOG_COMPLETENESS_REPORT_VERSION = "catalog-completeness-v1";

export interface CatalogCompletenessReportOptions {
  /** Product-level quarantine is deliberately separate from mapping quarantine. */
  productQuarantineReasons?: Readonly<Record<string, string>>;
}

export interface DuplicateDistribution {
  records: number;
  uniqueValues: number;
  repeatedRows: number;
  repeatedGroups: number;
  maxMultiplicity: number;
}

export interface CatalogCompletenessReport {
  schemaVersion: typeof CATALOG_COMPLETENESS_REPORT_VERSION;
  source: {
    sourceId: string;
    fileName: string | null;
    sourceUrl: string | null;
    contentLength: number | null;
    sha256: string | null;
    encoding: string;
    format: string;
  };
  definitions: {
    searchableKey: string;
    rawTradeName: string;
    normalizedTradeName: string;
    uniqueTradeName: string;
    trademarkNormalization: string;
    rawInnExpression: string;
    normalizedInnExpression: string;
    importableInn: string;
    combinationSignature: string;
    actualProductDuplicate: string;
    repeatedMedicineFingerprint: string;
    mappingCandidateDuplicate: string;
    mappingCandidateQuarantine: string;
  };
  counts: {
    rawRows: number;
    parsedRows: number;
    registryRows: number;
    parseErrors: number;
    uniqueRawTradeNames: number;
    uniqueNormalizedTradeNames: number;
    uniqueTradeNames: number;
    tradeNameRowsWithTrademark: number;
    uniqueRawTradeNamesWithTrademark: number;
    legacyKeysCollapsedByTrademarkNormalization: number;
    uniqueRawInnExpressions: number;
    uniqueNormalizedInnExpressions: number;
    importableInnRows: number;
    uniqueRawImportableInnExpressions: number;
    uniqueNormalizedImportableInnExpressions: number;
    combinationRows: number;
    uniqueCombinationSignatures: number;
    combinationRowsWithoutSignature: number;
    missing: {
      tradeName: number;
      rawInn: number;
      activeIngredient: number;
      normalizedTradeName: number;
      normalizedNameKey: number;
      searchableKey: number;
    };
  };
  coverage: {
    directOwnTradeNameSearchableRows: number;
    searchableRows: number;
    explicitlyQuarantinedUnsearchableRows: number;
    unexplainedUnsearchableRows: number;
    allRegistryProductsAccountedFor: boolean;
    explicitlyQuarantined: Array<{ registryId: string; reason: string }>;
    unexplainedRegistryIds: string[];
  };
  duplicates: {
    productRows: {
      registryId: DuplicateDistribution;
      normalizedTradeName: DuplicateDistribution;
      registrationNumber: DuplicateDistribution;
      normalizedMedicineFingerprint: DuplicateDistribution;
      actualDuplicateRegistryIdRows: number;
      note: string;
    };
    mappingCandidates: {
      generatedRows: number;
      duplicateRows: number;
      quarantinedRows: number;
      conflictGroups: number;
      note: string;
    };
  };
  integrity: {
    ok: boolean;
    failures: string[];
  };
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function duplicateDistribution(
  values: readonly string[],
): DuplicateDistribution {
  const multiplicities = [...countValues(values).values()];
  return {
    records: values.length,
    uniqueValues: multiplicities.length,
    repeatedRows: multiplicities.reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    repeatedGroups: multiplicities.filter((count) => count > 1).length,
    maxMultiplicity: multiplicities.length ? Math.max(...multiplicities) : 0,
  };
}

const REGISTERED_MARK_PLACEHOLDER = "\u{e000}";
const TRADEMARK_MARK_PLACEHOLDER = "\u{e001}";
const TRADEMARK_MARK_PATTERN = /[®™]/u;

function legacyNormalizeBeforeTrademarkRemoval(value: string): string {
  return normalize(
    value
      .replaceAll("®", REGISTERED_MARK_PLACEHOLDER)
      .replaceAll("™", TRADEMARK_MARK_PLACEHOLDER),
  )
    .replaceAll(REGISTERED_MARK_PLACEHOLDER, "®")
    .replaceAll(TRADEMARK_MARK_PLACEHOLDER, "tm");
}

function normalizedNameKeys(row: RegistryRawRow): string[] {
  return [row.tradeName, row.inn, row.activeIngredient]
    .map(normalize)
    .filter(Boolean);
}

function searchableKeys(row: RegistryRawRow): string[] {
  return [
    ...normalizedNameKeys(row),
    normalize(row.applicantName),
    normalize(row.registrationNumber),
    normalize(row.form),
    normalize(row.atcCode ?? ""),
    ...row.manufacturers.map((manufacturer) => normalize(manufacturer.name)),
  ].filter(Boolean);
}

function combinationSignature(row: RegistryRawRow): string {
  return [
    ...new Set(
      row.ingredientParse.parsedIngredients.map(normalize).filter(Boolean),
    ),
  ]
    .sort()
    .join("+");
}

function normalizedMedicineFingerprint(row: RegistryRawRow): string {
  return [
    row.tradeName,
    row.inn,
    row.activeIngredient,
    row.form,
    row.registrationNumber,
  ]
    .map(normalize)
    .join("|");
}

function stableSource(
  registry: RegistryParseResult,
): CatalogCompletenessReport["source"] {
  return {
    sourceId: registry.sourceId,
    fileName: registry.fileName,
    sourceUrl: registry.snapshot?.sourceUrl ?? null,
    contentLength: registry.snapshot?.contentLength ?? null,
    sha256: registry.snapshot?.sha256 ?? null,
    encoding: registry.snapshot?.encoding ?? "unknown",
    format: registry.snapshot?.format ?? "unknown",
  };
}

export function buildCatalogCompletenessReport(
  registry: RegistryParseResult,
  options: CatalogCompletenessReportOptions = {},
): CatalogCompletenessReport {
  const mappingPlan = buildRegistryMappingPlan(registry);
  const rows = registry.rows;
  const rawTradeNames = rows.map((row) => row.tradeName.trim()).filter(Boolean);
  const normalizedTradeNameKeys = rows
    .map((row) => normalize(row.tradeName))
    .filter(Boolean);
  const legacyTradeNameKeys = rows
    .map((row) => legacyNormalizeBeforeTrademarkRemoval(row.tradeName))
    .filter(Boolean);
  const trademarkTradeNames = rows
    .map((row) => row.tradeName.trim())
    .filter((value) => TRADEMARK_MARK_PATTERN.test(value));
  const rawInnExpressions = rows.map((row) => row.inn.trim()).filter(Boolean);
  const normalizedInnExpressionKeys = rows
    .map((row) => normalize(row.inn))
    .filter(Boolean);
  const importableInnRows = rows.filter(
    (row) => !row.warnings.includes("missing_importable_inn"),
  );
  const rawImportableInnExpressions = importableInnRows
    .map((row) => row.inn.trim())
    .filter(Boolean);
  const normalizedImportableInnExpressionKeys = importableInnRows
    .map((row) => normalize(row.inn))
    .filter(Boolean);
  const combinationRows = rows.filter((row) =>
    row.warnings.includes("combination_or_multi_ingredient"),
  );
  const combinationSignatures = combinationRows
    .map(combinationSignature)
    .filter(Boolean);
  const registryIds = rows.map((row) => row.registryId);
  const registrationKeys = rows
    .map((row) => normalize(row.registrationNumber))
    .filter(Boolean);
  const medicineFingerprints = rows
    .map(normalizedMedicineFingerprint)
    .filter((value) => value !== "||||");
  const registryIdDuplicates = duplicateDistribution(registryIds);

  const unsearchableRows = rows.filter(
    (row) => searchableKeys(row).length === 0,
  );
  const explicitlyQuarantined: Array<{ registryId: string; reason: string }> =
    [];
  const unexplainedRegistryIds: string[] = [];
  for (const row of unsearchableRows) {
    const reason = options.productQuarantineReasons?.[row.registryId]?.trim();
    if (reason)
      explicitlyQuarantined.push({ registryId: row.registryId, reason });
    else unexplainedRegistryIds.push(row.registryId);
  }
  explicitlyQuarantined.sort((a, b) =>
    a.registryId.localeCompare(b.registryId),
  );
  unexplainedRegistryIds.sort();

  const failures: string[] = [];
  if (registry.parseErrors.length > 0) {
    failures.push(
      `${registry.parseErrors.length} registry parse errors were reported.`,
    );
  }
  if (
    registry.rawRows !== registry.parsedRows ||
    registry.parsedRows !== rows.length
  ) {
    failures.push("Raw, parsed and retained registry row counts do not match.");
  }
  if (registryIdDuplicates.repeatedRows > 0) {
    failures.push(
      `${registryIdDuplicates.repeatedRows} registry rows repeat an official registry ID.`,
    );
  }
  if (unexplainedRegistryIds.length > 0) {
    failures.push(
      `${unexplainedRegistryIds.length} registry rows lack every searchable key and an explicit product quarantine reason.`,
    );
  }

  return {
    schemaVersion: CATALOG_COMPLETENESS_REPORT_VERSION,
    source: stableSource(registry),
    definitions: {
      searchableKey:
        "A normalized value from trade name, INN, active ingredient, applicant, registration number, form, ATC code or manufacturer; registry ID alone is not searchable.",
      rawTradeName:
        "Distinct non-empty official trade-name expressions after trim only; comparison remains case-sensitive and punctuation-preserving.",
      normalizedTradeName:
        "Distinct non-empty official trade-name keys after the shared normalize() function.",
      uniqueTradeName:
        "Backward-compatible alias for uniqueNormalizedTradeNames; it is canonical, not a raw expression count.",
      trademarkNormalization:
        "Rows containing ® or ™ are counted directly. Collapsed legacy keys are the difference between distinct keys from the pre-trademark-removal normalizer and current shared-normalized keys.",
      rawInnExpression:
        "Distinct non-empty official INN expressions after trim only; comparison remains case-sensitive and punctuation-preserving.",
      normalizedInnExpression:
        "Distinct non-empty official INN expression keys after the shared normalize() function.",
      importableInn:
        "An official INN row that the registry parser did not mark missing_importable_inn; raw-expression and shared-normalized distinct counts are reported separately.",
      combinationSignature:
        "Sorted distinct shared-normalized parsed ingredient components joined with '+'.",
      actualProductDuplicate:
        "A repeated official registry_id; this is the product-table primary key.",
      repeatedMedicineFingerprint:
        "A repeated normalized trade-name + INN + active-ingredient + form + registration-number fingerprint; this is diagnostic and is not treated as a duplicate primary-key row.",
      mappingCandidateDuplicate:
        "A duplicate generated name-to-ingredient mapping candidate; it is not a duplicate registry product.",
      mappingCandidateQuarantine:
        "A generated mapping candidate withheld from automatic mapping approval; it does not remove the registry product from catalog search.",
    },
    counts: {
      rawRows: registry.rawRows,
      parsedRows: registry.parsedRows,
      registryRows: rows.length,
      parseErrors: registry.parseErrors.length,
      uniqueRawTradeNames: new Set(rawTradeNames).size,
      uniqueNormalizedTradeNames: new Set(normalizedTradeNameKeys).size,
      uniqueTradeNames: new Set(normalizedTradeNameKeys).size,
      tradeNameRowsWithTrademark: trademarkTradeNames.length,
      uniqueRawTradeNamesWithTrademark: new Set(trademarkTradeNames).size,
      legacyKeysCollapsedByTrademarkNormalization:
        new Set(legacyTradeNameKeys).size -
        new Set(normalizedTradeNameKeys).size,
      uniqueRawInnExpressions: new Set(rawInnExpressions).size,
      uniqueNormalizedInnExpressions: new Set(normalizedInnExpressionKeys).size,
      importableInnRows: importableInnRows.length,
      uniqueRawImportableInnExpressions: new Set(rawImportableInnExpressions)
        .size,
      uniqueNormalizedImportableInnExpressions: new Set(
        normalizedImportableInnExpressionKeys,
      ).size,
      combinationRows: combinationRows.length,
      uniqueCombinationSignatures: new Set(combinationSignatures).size,
      combinationRowsWithoutSignature:
        combinationRows.length - combinationSignatures.length,
      missing: {
        tradeName: rows.filter((row) => !row.tradeName.trim()).length,
        rawInn: rows.filter((row) => !row.inn.trim()).length,
        activeIngredient: rows.filter((row) => !row.activeIngredient.trim())
          .length,
        normalizedTradeName: rows.filter((row) => !normalize(row.tradeName))
          .length,
        normalizedNameKey: rows.filter(
          (row) => normalizedNameKeys(row).length === 0,
        ).length,
        searchableKey: unsearchableRows.length,
      },
    },
    coverage: {
      directOwnTradeNameSearchableRows: rows.filter((row) =>
        Boolean(normalize(row.tradeName)),
      ).length,
      searchableRows: rows.length - unsearchableRows.length,
      explicitlyQuarantinedUnsearchableRows: explicitlyQuarantined.length,
      unexplainedUnsearchableRows: unexplainedRegistryIds.length,
      allRegistryProductsAccountedFor: unexplainedRegistryIds.length === 0,
      explicitlyQuarantined,
      unexplainedRegistryIds,
    },
    duplicates: {
      productRows: {
        registryId: registryIdDuplicates,
        normalizedTradeName: duplicateDistribution(normalizedTradeNameKeys),
        registrationNumber: duplicateDistribution(registrationKeys),
        normalizedMedicineFingerprint:
          duplicateDistribution(medicineFingerprints),
        actualDuplicateRegistryIdRows: registryIdDuplicates.repeatedRows,
        note: "Only repeated registry IDs are actual product-row duplicates. Repeated names, registrations and medicine fingerprints are reported separately and can represent legitimate registry positions.",
      },
      mappingCandidates: {
        generatedRows: registry.generatedCandidates,
        duplicateRows: mappingPlan.duplicateCount,
        quarantinedRows: mappingPlan.quarantinedRows.length,
        conflictGroups: mappingPlan.conflictGroups.length,
        note: "Mapping candidate duplicates and quarantines are review-workflow counts; neither count removes products from the registry catalog.",
      },
    },
    integrity: {
      ok: failures.length === 0,
      failures,
    },
  };
}

export function assertOfficialIngredientCoverage(
  report: CatalogCompletenessReport,
): void {
  const { rawInn, activeIngredient } = report.counts.missing;
  if (rawInn > 0 || activeIngredient > 0) {
    throw new Error(
      `Official ingredient coverage failed: ${rawInn} rows lack INN and ${activeIngredient} rows lack active composition.`,
    );
  }
}
export function assertCatalogCompletenessReport(
  report: CatalogCompletenessReport,
): void {
  if (!report.integrity.ok) {
    throw new Error(
      `Catalog completeness report failed: ${report.integrity.failures.join(" ")}`,
    );
  }
}
