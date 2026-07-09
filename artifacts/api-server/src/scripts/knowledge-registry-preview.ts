import { parseRegistryFile } from "../knowledge/ingestion";
import { buildReviewableImportPlan } from "../knowledge/ingestion/commit";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function positionalFile(): string | null {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
    : "Registry preview failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  if (!file) {
    console.error("Provide --file=<registry.csv|tsv|json>.");
    process.exit(1);
  }
  const registry = parseRegistryFile(file, {
    includeTradeNames: !process.argv.includes("--no-trade-names"),
  });
  const plan = buildReviewableImportPlan(registry.candidates);
  console.log(JSON.stringify({
    ...registry,
    rows: undefined,
    candidates: undefined,
    preview: plan.preview,
    reviewableRows: plan.reviewable.length,
    blocked: plan.blocked,
  }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
