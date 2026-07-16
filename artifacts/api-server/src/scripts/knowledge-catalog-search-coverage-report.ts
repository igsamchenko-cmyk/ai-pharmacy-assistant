import {
  DEFAULT_CATALOG_SEARCH_COVERAGE_REPORT_PATH,
  buildOfficialCatalogSearchCoverageReport,
  writeCatalogSearchCoverageReport,
} from "../beta/catalogSearchCoverageReport";

function argValue(prefix: string): string | null {
  return process.argv.find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Catalog search coverage report failed.";
  return error.message
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
    .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]");
}

async function main(): Promise<void> {
  if (process.argv.includes("--write")) {
    const path = argValue("--out=") ?? DEFAULT_CATALOG_SEARCH_COVERAGE_REPORT_PATH;
    const report = await writeCatalogSearchCoverageReport(path);
    console.log(JSON.stringify({
      ok: report.summary.afterMisses === 0,
      written: path,
      source: report.source,
      summary: report.summary,
      aliasSelection: report.aliasSelection,
    }, null, 2));
    return;
  }

  console.log(JSON.stringify(await buildOfficialCatalogSearchCoverageReport(), null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
