import { readFileSync } from "node:fs";
import {
  buildReviewableImportPlan,
  commitReviewableImportPlan,
  listIngestionBatchFiles,
  parseDictionaryBatchFile,
  parseImportCsv,
} from "../knowledge";
import { resolveDataFilePath } from "../lib/dataPath";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Candidate commit failed.";
}

async function main(): Promise<void> {
  const doCommit = process.argv.includes("--commit");
  const force = process.argv.includes("--force");
  const file = argValue("--file=");
  const parsed = file
    ? parseImportCsv(
        readFileSync(resolveDataFilePath(file, { moduleUrl: import.meta.url }), "utf8"),
      )
    : {
        rows: listIngestionBatchFiles().flatMap((batch) => parseDictionaryBatchFile(batch).rows),
        errors: [],
      };
  const plan = buildReviewableImportPlan(parsed.rows, parsed.errors);
  if (!doCommit) {
    console.log(JSON.stringify({
      ok: plan.blocked.length === 0,
      dryRun: true,
      rows: plan.reviewable.length,
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
