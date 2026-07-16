import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCatalogCompletenessReport,
  buildCatalogCompletenessReport,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
} from "../knowledge/ingestion";

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-completeness-report.json",
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
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Catalog completeness report failed.";
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
  const report = buildCatalogCompletenessReport(registry);
  assertCatalogCompletenessReport(report);

  if (process.argv.includes("--write")) {
    const requestedPath = argValue("--out=");
    const outputPath = requestedPath
      ? resolve(requestedPath)
      : DEFAULT_REPORT_PATH;
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(
      JSON.stringify(
        {
          ok: true,
          written:
            requestedPath ??
            "artifacts/reports/catalog-completeness-report.json",
          registryRows: report.counts.registryRows,
          uniqueTradeNames: report.counts.uniqueTradeNames,
          unexplainedUnsearchableRows:
            report.coverage.unexplainedUnsearchableRows,
          sourceSha256: report.source.sha256,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
