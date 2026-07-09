import { writeFileSync } from "node:fs";
import {
  generateImportCandidates,
  importRowsToCsv,
  parseImportCsv,
} from "../knowledge";
import { resolveDataFilePath } from "../lib/dataPath";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
    : "Candidate generation failed.";
}

async function main(): Promise<void> {
  const input = argValue("--input=");
  if (!input) {
    console.error("Provide --input=<canonical-import.csv>.");
    process.exit(1);
  }
  const fs = await import("node:fs");
  const parsed = parseImportCsv(readInputFile(fs, input));
  if (parsed.errors.length > 0) {
    console.log(JSON.stringify({ ok: false, parseErrors: parsed.errors }, null, 2));
    process.exit(1);
  }
  const result = generateImportCandidates(parsed.rows, {
    includeTypos: !process.argv.includes("--no-typos"),
    includeTransliterations: !process.argv.includes("--no-transliterations"),
  });
  const out = argValue("--out=");
  const csv = importRowsToCsv(result.rows);
  if (out) {
    writeFileSync(out, csv, "utf8");
    console.log(JSON.stringify({ ok: true, written: out, ...result, rows: undefined }, null, 2));
    return;
  }
  console.log(csv);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});

function readInputFile(
  fs: typeof import("node:fs"),
  input: string,
): string {
  return fs.readFileSync(
    resolveDataFilePath(input, { moduleUrl: import.meta.url }),
    "utf8",
  );
}
