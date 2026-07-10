import {
  buildRegistryProductionSummary,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
} from "../knowledge/ingestion";
import { buildReviewableImportPlan } from "../knowledge/ingestion/commit";

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

  const plan = buildReviewableImportPlan(parsedRegistry.candidates);
  console.log(JSON.stringify({
    ok: plan.blocked.length === 0,
    productionSummary: buildRegistryProductionSummary(
      parsedRegistry,
      plan.preview.reviewDistribution,
    ),
    preview: plan.preview,
    blocked: plan.blocked,
    parseErrors: parsedRegistry.parseErrors.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
