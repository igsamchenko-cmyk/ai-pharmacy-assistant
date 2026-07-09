import {
  buildReviewableImportPlan,
  commitReviewableImportPlan,
  parseRegistryFile,
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
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Registry import failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  if (!file) {
    console.error("Provide --file=<registry.csv|tsv|json>.");
    process.exit(1);
  }
  const doCommit = process.argv.includes("--commit");
  const force = process.argv.includes("--force");
  const registry = parseRegistryFile(file, {
    includeTradeNames: !process.argv.includes("--no-trade-names"),
  });
  const plan = buildReviewableImportPlan(registry.candidates);
  if (!doCommit) {
    console.log(JSON.stringify({
      ok: plan.blocked.length === 0,
      dryRun: true,
      generatedCandidates: registry.generatedCandidates,
      preview: plan.preview,
      blocked: plan.blocked,
      message: "Dry-run only. Add --commit to write reviewable rows.",
    }, null, 2));
    return;
  }
  const result = await commitReviewableImportPlan(plan, { force });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
