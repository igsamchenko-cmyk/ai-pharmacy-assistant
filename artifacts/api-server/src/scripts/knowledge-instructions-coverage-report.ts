import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
} from "../knowledge/ingestion";
import { loadInstructionManifest } from "../knowledge/instructions/catalog";
import { buildOfficialInstructionCoverageReport } from "../knowledge/instructions/coverage";

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/official-instruction-coverage-report.json",
    import.meta.url,
  ),
);

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function positionalFile(): string | null {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/gu, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/gu, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "[database-url]")
    : "Official instruction coverage report failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  const download = process.argv.includes("--download") || !file;
  if (file && process.argv.includes("--download")) {
    throw new Error("Choose either --download or --file, not both.");
  }
  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, { snapshot: downloaded.metadata })
    : parseRegistryFile(file as string);
  if (registry.parseErrors.length) {
    throw new Error("Fresh official registry contains invalid rows.");
  }
  const report = buildOfficialInstructionCoverageReport(
    registry,
    loadInstructionManifest(),
  );
  if (!report.coverage.allProductsAccountedFor) {
    throw new Error(
      "Instruction coverage report does not account for all rows.",
    );
  }

  if (process.argv.includes("--write")) {
    const requestedPath = argValue("--out=");
    const outputPath = requestedPath
      ? resolve(requestedPath)
      : DEFAULT_REPORT_PATH;
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceSha256: report.source?.sha256 ?? null,
        ...report.counts,
        ...report.coverage,
        rejectedSourceUrlSamples: report.rejectedSourceUrlSamples,
        reportWritten: process.argv.includes("--write"),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
