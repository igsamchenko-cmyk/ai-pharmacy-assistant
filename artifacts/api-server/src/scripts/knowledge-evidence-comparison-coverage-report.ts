import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEvidenceComparisonCoverageReport,
  parseEvidenceRegistryIndex,
  renderEvidenceComparisonCoverageReport,
} from "../knowledge/evidenceComparisonCoverageReport";
import {
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
} from "../knowledge/ingestion";

const INDEX_PATH = fileURLToPath(
  new URL(
    "../../../pharmacy/src/lib/evidence-comparison-registry-index.json",
    import.meta.url,
  ),
);
const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/evidence-comparison-coverage-report.md",
    import.meta.url,
  ),
);

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Evidence comparison coverage report failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=");
  const download = process.argv.includes("--download");
  const expectedSha256 = argValue("--expected-sha256=")?.toLowerCase() ?? "";
  if ((!file && !download) || (file && download)) {
    throw new Error(
      "Choose exactly one registry source: --file=<csv> or --download.",
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new Error("--expected-sha256=<64 lowercase hex chars> is required.");
  }

  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, { snapshot: downloaded.metadata })
    : parseRegistryFile(file as string);
  const actualSha256 = registry.snapshot?.sha256?.toLowerCase() ?? "";
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      "Official registry SHA-256 does not match the explicit confirmation.",
    );
  }

  const index = parseEvidenceRegistryIndex(
    JSON.parse(readFileSync(INDEX_PATH, "utf8")),
  );
  const report = buildEvidenceComparisonCoverageReport(registry, index);
  const markdown = renderEvidenceComparisonCoverageReport(report);
  const outputPath = resolve(argValue("--out=") ?? DEFAULT_REPORT_PATH);

  if (process.argv.includes("--check")) {
    const current = readFileSync(outputPath, "utf8").replace(/\r\n/gu, "\n");
    if (current !== markdown)
      throw new Error("Evidence comparison coverage report drift detected.");
  } else if (process.argv.includes("--write")) {
    writeFileSync(outputPath, markdown, "utf8");
  } else {
    process.stdout.write(markdown);
  }

  console.error(
    JSON.stringify({
      ok: true,
      sourceSha256: report.officialRegistry.sourceSha256,
      officialRows: report.officialRegistry.validRows,
      normalizedInnExpressions: report.counts.normalizedInnExpressions,
      therapeuticClasses: report.counts.therapeuticClasses,
      potentialInnPairs: report.counts.potentialInnPairs,
      verifiedEvidenceRecords: report.counts.verifiedEvidenceRecords,
      insufficientEvidencePairs: report.counts.insufficientEvidencePairs,
    }),
  );
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
