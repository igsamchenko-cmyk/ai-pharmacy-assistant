import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ingredientSeeds } from "../knowledge/dictionary/ingredients";
import {
  getInstructionForProduct,
  loadInstructionManifest,
} from "../knowledge/instructions/catalog";
import {
  buildInteractionCandidatePipelineReport,
  DEFAULT_INTERACTION_CLASS_SEEDS,
} from "../interactions/candidatePipeline";
import { extractObservedRegistryRowsByInn } from "../interactions/coverageReport";
import { verifiedInteractionRules } from "../interactions/verifiedRules";

const DEFAULT_SEARCH_REPORT = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-search-coverage-report.json",
    import.meta.url,
  ),
);
const DEFAULT_OUTPUT = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/interaction-candidate-pipeline-report.json",
    import.meta.url,
  ),
);

function argValue(prefix: string): string | null {
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/gu, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/gu, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "[database-url]")
    : "Interaction candidate report failed.";
}

function main(): void {
  const manifest = loadInstructionManifest();
  const snapshots = manifest.products.map((product) => {
    const snapshot = getInstructionForProduct(product.registryProductId);
    if (!snapshot) {
      throw new Error(
        `instruction_snapshot_missing:${product.registrationNumber}`,
      );
    }
    return snapshot;
  });
  const searchPath = resolve(
    argValue("--search-report=") ?? DEFAULT_SEARCH_REPORT,
  );
  const observedRegistryRowsByInn = extractObservedRegistryRowsByInn(
    JSON.parse(readFileSync(searchPath, "utf8")) as unknown,
    ingredientSeeds,
  );
  const report = buildInteractionCandidatePipelineReport({
    snapshots,
    ingredientSeeds,
    verifiedRules: verifiedInteractionRules,
    classSeeds: DEFAULT_INTERACTION_CLASS_SEEDS,
    observedRegistryRowsByInn,
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = resolve(argValue("--out=") ?? DEFAULT_OUTPUT);

  if (process.argv.includes("--check")) {
    const current = readFileSync(outputPath, "utf8").replace(/\r\n/gu, "\n");
    if (current !== output) {
      throw new Error("Interaction candidate report drift detected.");
    }
  } else if (process.argv.includes("--write")) {
    writeFileSync(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  console.error(
    JSON.stringify({
      ok: true,
      instructions: report.counts.instructionDocuments,
      resolvedSubjects: report.counts.resolvedSubjectDocuments,
      uniqueCandidates: report.counts.uniqueCandidates,
      needsReview: report.counts.needsReviewCandidates,
      alreadyVerified: report.counts.alreadyVerifiedCandidates,
      reviewQueue: report.reviewQueue.length,
      automaticApproval: report.safety.automaticApproval,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(safeMessage(error));
  process.exit(1);
}
