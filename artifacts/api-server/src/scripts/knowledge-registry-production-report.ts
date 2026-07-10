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
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Registry production report failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  const includeTradeNames = !process.argv.includes("--no-trade-names");
  const downloaded = file ? null : await downloadOfficialRegistrySnapshot();
  const parsedRegistry = downloaded
    ? parseRegistryText(downloaded.text, {
        includeTradeNames,
        snapshot: downloaded.metadata,
      })
    : parseRegistryFile(file as string, { includeTradeNames });

  const plan = buildRegistryMappingPlan(parsedRegistry);
  const ok =
    plan.readiness.productSnapshotReady &&
    plan.readiness.approvedMappingsReady &&
    plan.approvedCandidateConflicts === 0;
  console.log(JSON.stringify({
    ok,
    productionSummary: buildRegistryProductionSummary(
      parsedRegistry,
      plan.stats,
    ),
    approvedPreview: summarizeImportPreview(plan.approvedCandidatesPlan.preview),
    reviewPreview: summarizeImportPreview(plan.allCandidatesPlan.preview),
    conflictGroups: {
      total: plan.conflictGroups.length,
      top: plan.topConflictGroups,
    },
    blocked: plan.blocked,
    parseErrors: parsedRegistry.parseErrors.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
