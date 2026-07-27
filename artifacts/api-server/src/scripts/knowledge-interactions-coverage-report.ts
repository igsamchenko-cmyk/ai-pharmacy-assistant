import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { interactionRules } from "../data/interactions";
import {
  buildInteractionEvidenceCoverageReport,
  extractObservedRegistryRowsByInn,
  type InteractionCatalogSnapshot,
} from "../interactions/coverageReport";
import { verifiedInteractionRules } from "../interactions/verifiedRules";
import { ingredientSeeds } from "../knowledge/dictionary/ingredients";

const DEFAULT_COMPLETENESS_REPORT = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-completeness-report.json",
    import.meta.url,
  ),
);
const DEFAULT_SEARCH_REPORT = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-search-coverage-report.json",
    import.meta.url,
  ),
);
const DEFAULT_OUTPUT = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/interaction-evidence-coverage-report.json",
    import.meta.url,
  ),
);

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function parseCatalogSnapshot(value: unknown): InteractionCatalogSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Catalog completeness report must be an object.");
  }
  const report = value as {
    source?: { sha256?: unknown };
    counts?: {
      registryRows?: unknown;
      uniqueNormalizedInnExpressions?: unknown;
    };
  };
  const sourceSha256 = report.source?.sha256;
  const registryRows = report.counts?.registryRows;
  const uniqueNormalizedInnExpressions =
    report.counts?.uniqueNormalizedInnExpressions;
  if (
    typeof sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(sourceSha256) ||
    typeof registryRows !== "number" ||
    !Number.isInteger(registryRows) ||
    registryRows < 1 ||
    typeof uniqueNormalizedInnExpressions !== "number" ||
    !Number.isInteger(uniqueNormalizedInnExpressions) ||
    uniqueNormalizedInnExpressions < 1
  ) {
    throw new Error("Catalog completeness report metadata is invalid.");
  }
  return {
    sourceSha256,
    registryRows,
    uniqueNormalizedInnExpressions,
  };
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/gu, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/gu, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "[database-url]")
    : "Interaction evidence coverage report failed.";
}

function main(): void {
  const completenessPath = resolve(
    argValue("--catalog-report=") ?? DEFAULT_COMPLETENESS_REPORT,
  );
  const searchPath = resolve(
    argValue("--search-report=") ?? DEFAULT_SEARCH_REPORT,
  );
  const outputPath = resolve(argValue("--out=") ?? DEFAULT_OUTPUT);
  const catalogSnapshot = parseCatalogSnapshot(readJson(completenessPath));
  const observedRegistryRowsByInn = extractObservedRegistryRowsByInn(
    readJson(searchPath),
    ingredientSeeds,
  );
  const report = buildInteractionEvidenceCoverageReport({
    ingredientSeeds,
    verifiedRules: verifiedInteractionRules,
    legacyRules: interactionRules,
    catalogSnapshot,
    observedRegistryRowsByInn,
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    const current = readFileSync(outputPath, "utf8").replace(/\r\n/gu, "\n");
    if (current !== output) {
      throw new Error("Interaction evidence coverage report drift detected.");
    }
  } else if (process.argv.includes("--write")) {
    writeFileSync(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  console.error(
    JSON.stringify({
      ok: true,
      sourceSha256: report.catalog.sourceSha256,
      registryRows: report.catalog.registryRows,
      canonicalInnCount: report.catalog.canonicalInnCount,
      potentialExactPairs: report.counts.potentialExactPairs,
      verifiedPairs: report.counts.verifiedPairs,
      needsReviewPairs: report.counts.needsReviewPairs,
      unsupportedPairs: report.counts.unsupportedPairs,
      priorityQueue: report.priorityQueue.length,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(safeMessage(error));
  process.exit(1);
}
