import { readFileSync } from "node:fs";
import {
  buildBulkIngestReport,
  buildReviewableImportPlan,
  parseImportCsv,
} from "../knowledge";
import { resolveDataFilePath } from "../lib/dataPath";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
    : "Candidate preview failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=");
  if (!file) {
    console.log(JSON.stringify(buildBulkIngestReport(), null, 2));
    return;
  }
  const parsed = parseImportCsv(
    readFileSync(resolveDataFilePath(file, { moduleUrl: import.meta.url }), "utf8"),
  );
  const plan = buildReviewableImportPlan(parsed.rows, parsed.errors);
  console.log(JSON.stringify({
    file: file.split(/[\\/]/).pop(),
    rows: parsed.rows.length,
    errors: parsed.errors.length,
    preview: plan.preview,
    blocked: plan.blocked,
  }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
