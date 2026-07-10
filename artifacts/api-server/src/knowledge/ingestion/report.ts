import { readFileSync } from "node:fs";
import {
  analyzeImport,
  liveKnowledgeView,
} from "../import/analyze";
import { resolveDataFilePath } from "../../lib/dataPath";
import {
  listDictionaryBatchFiles,
  parseDictionaryBatchFile,
} from "../import/batches";
import type { ImportRow } from "../import/format";
import type { ImportRowError } from "../import/parse";
import { discoverIngestionSources } from "./sources";
import {
  buildRegistryProductionSummary,
  OFFICIAL_UKRAINE_REGISTRY_CSV_URL,
  parseRegistryText,
} from "./registry";

export interface BulkIngestReport {
  version: "1.6-bulk-ingest";
  generatedAt: string;
  sourceDiscovery: {
    approvedSources: number;
    candidateSources: number;
    blockedSources: number;
  };
  registry: {
    sampleFiles: number;
    sourceUrl: string | null;
    snapshotFormat: string | null;
    snapshotEncoding: string | null;
    snapshotSha256: string | null;
    rawRows: number;
    validProducts: number;
    uniqueIngredients: number;
    uniqueManufacturers: number;
    uniqueRegistrations: number;
    generatedCandidates: number;
    genericCandidates: number;
    brandCandidates: number;
    parseErrors: number;
    warnings: string[];
  };
  candidates: {
    files: number;
    rows: number;
    approved: number;
    pending: number;
    needsReview: number;
    rejected: number;
    conflicts: number;
    missingSources: number;
    invalidAtc: number;
    copyrightViolations: number;
    wouldSucceed: boolean;
    fileNames: string[];
  };
  runtimeSafety: {
    approvedOnlyRuntime: true;
    pendingNeedsReviewHidden: true;
    postgresMandatory: false;
    staticFallbackPreserved: true;
  };
  warnings: string[];
}

export const INGESTION_BATCH_FILE_PATTERN =
  /^001[0-3]-.+\.csv$/i;

export function listIngestionBatchFiles() {
  return listDictionaryBatchFiles().filter((file) =>
    INGESTION_BATCH_FILE_PATTERN.test(file.fileName),
  );
}

export function buildBulkIngestReport(options: {
  registrySamplePath?: string;
  now?: Date;
} = {}): BulkIngestReport {
  const now = options.now ?? new Date();
  const sourceDiscovery = discoverIngestionSources(now);
  const candidateFiles = listIngestionBatchFiles();
  const allRows: ImportRow[] = [];
  const allErrors: ImportRowError[] = [];
  const fileNames: string[] = [];

  for (const file of candidateFiles) {
    const parsed = parseDictionaryBatchFile(file);
    fileNames.push(file.fileName);
    allRows.push(...parsed.rows);
    allErrors.push(...parsed.errors);
  }

  const combined = analyzeImport(allRows, liveKnowledgeView(), allErrors);
  const registrySamplePath =
    options.registrySamplePath ??
    resolveDataFilePath("data/imports/ukraine-registry-sample.csv", {
      moduleUrl: import.meta.url,
    });
  let registryRawRows = 0;
  let registryValidProducts = 0;
  let registryUniqueIngredients = 0;
  let registryUniqueManufacturers = 0;
  let registryUniqueRegistrations = 0;
  let registryCandidates = 0;
  let registryGenericCandidates = 0;
  let registryBrandCandidates = 0;
  let registryParseErrors = 0;
  let registryWarnings: string[] = [];

  try {
    const registry = parseRegistryText(readFileSync(registrySamplePath, "utf8"), {
      fileName: "ukraine-registry-sample.csv",
    });
    const registrySummary = buildRegistryProductionSummary(registry);
    registryRawRows = registry.rawRows;
    registryValidProducts = registrySummary.rows.validProducts;
    registryUniqueIngredients = registrySummary.ingredients.uniqueInn;
    registryUniqueManufacturers = registrySummary.manufacturers.uniqueManufacturers;
    registryUniqueRegistrations = registrySummary.registrations.uniqueNumbers;
    registryCandidates = registry.generatedCandidates;
    registryGenericCandidates = registrySummary.mappings.genericCandidates;
    registryBrandCandidates = registrySummary.mappings.brandCandidates;
    registryParseErrors = registry.parseErrors.length;
    registryWarnings = registry.warnings;
  } catch {
    registryWarnings = ["Registry sample file is unavailable."];
  }

  return {
    version: "1.6-bulk-ingest",
    generatedAt: now.toISOString(),
    sourceDiscovery: {
      approvedSources: sourceDiscovery.approvedSources,
      candidateSources: sourceDiscovery.candidateSources,
      blockedSources: sourceDiscovery.blockedSources,
    },
    registry: {
      sampleFiles: registryRawRows > 0 ? 1 : 0,
      sourceUrl: OFFICIAL_UKRAINE_REGISTRY_CSV_URL,
      snapshotFormat: "csv",
      snapshotEncoding: "windows-1251",
      snapshotSha256: null,
      rawRows: registryRawRows,
      validProducts: registryValidProducts,
      uniqueIngredients: registryUniqueIngredients,
      uniqueManufacturers: registryUniqueManufacturers,
      uniqueRegistrations: registryUniqueRegistrations,
      generatedCandidates: registryCandidates,
      genericCandidates: registryGenericCandidates,
      brandCandidates: registryBrandCandidates,
      parseErrors: registryParseErrors,
      warnings: registryWarnings,
    },
    candidates: {
      files: candidateFiles.length,
      rows: combined.rowsParsed,
      approved: combined.reviewDistribution.approved,
      pending: combined.reviewDistribution.pending,
      needsReview: combined.reviewDistribution.needs_review,
      rejected: combined.reviewDistribution.rejected,
      conflicts: combined.conflicts.length,
      missingSources: combined.missingSources,
      invalidAtc: combined.invalidAtc,
      copyrightViolations: combined.copyrightViolations,
      wouldSucceed: combined.wouldSucceed,
      fileNames,
    },
    runtimeSafety: {
      approvedOnlyRuntime: true,
      pendingNeedsReviewHidden: true,
      postgresMandatory: false,
      staticFallbackPreserved: true,
    },
    warnings: [
      ...registryWarnings,
      "Candidate commit is dry-run by default and requires explicit --commit.",
      "Only approved rows participate in DB runtime lookup.",
    ],
  };
}
