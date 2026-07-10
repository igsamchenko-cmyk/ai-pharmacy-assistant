import {
  buildRegistryProductionSummary,
  buildRegistryMappingPlan,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
  summarizeImportPreview,
} from "../knowledge/ingestion";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function positionalFile(): string | null {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
    : "Registry preview failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  const download = process.argv.includes("--download");
  if (!file && !download) {
    console.error("Provide --file=<registry.csv|tsv|json> or --download.");
    process.exit(1);
  }
  const includeTradeNames = !process.argv.includes("--no-trade-names");
  const downloaded = download
    ? await downloadOfficialRegistrySnapshot()
    : null;
  const parsedRegistry = downloaded
    ? parseRegistryText(downloaded.text, {
        includeTradeNames,
        snapshot: downloaded.metadata,
      })
    : parseRegistryFile(file as string, { includeTradeNames });
  const plan = buildRegistryMappingPlan(parsedRegistry);
  const productionSummary = buildRegistryProductionSummary(
    parsedRegistry,
    plan.stats,
  );
  console.log(JSON.stringify({
    ok: plan.blocked.length === 0,
    ...parsedRegistry,
    rows: undefined,
    candidates: undefined,
    productionSummary,
    approvedPreview: summarizeImportPreview(plan.approvedCandidatesPlan.preview),
    reviewPreview: summarizeImportPreview(plan.allCandidatesPlan.preview),
    reviewableRows: plan.allCandidatesPlan.reviewable.length,
    approvedRows: plan.approvedReviewableRows.length,
    reviewOnlyRows: plan.reviewOnlyRows.length,
    quarantinedRows: plan.quarantinedRows.length,
    conflictGroups: {
      total: plan.conflictGroups.length,
      top: plan.topConflictGroups,
    },
    blocked: plan.blocked,
  }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
