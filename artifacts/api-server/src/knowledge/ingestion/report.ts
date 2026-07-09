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
import { parseRegistryText } from "./registry";

export interface BulkIngestReport {
  version: "1.5-bulk-ingest";
  generatedAt: string;
  sourceDiscovery: {
    approvedSources: number;
    candidateSources: number;
    blockedSources: number;
  };
  registry: {
    sampleFiles: number;
    rawRows: number;
    generatedCandidates: number;
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
  let registryCandidates = 0;
  let registryParseErrors = 0;
  let registryWarnings: string[] = [];

  try {
    const registry = parseRegistryText(readFileSync(registrySamplePath, "utf8"), {
      fileName: "ukraine-registry-sample.csv",
    });
    registryRawRows = registry.rawRows;
    registryCandidates = registry.generatedCandidates;
    registryParseErrors = registry.parseErrors.length;
    registryWarnings = registry.warnings;
  } catch {
    registryWarnings = ["Registry sample file is unavailable."];
  }

  return {
    version: "1.5-bulk-ingest",
    generatedAt: now.toISOString(),
    sourceDiscovery: {
      approvedSources: sourceDiscovery.approvedSources,
      candidateSources: sourceDiscovery.candidateSources,
      blockedSources: sourceDiscovery.blockedSources,
    },
    registry: {
      sampleFiles: registryRawRows > 0 ? 1 : 0,
      rawRows: registryRawRows,
      generatedCandidates: registryCandidates,
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
