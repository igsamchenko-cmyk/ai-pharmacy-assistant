import {
  DEFAULT_SEARCH_QUALITY_REPORT_PATH,
  buildSearchQualityReport,
  writeSearchQualityReport,
} from "../beta/searchQualityReport";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main(): Promise<void> {
  const writePath = process.argv.includes("--write")
    ? (argValue("--out=") ?? DEFAULT_SEARCH_QUALITY_REPORT_PATH)
    : null;

  if (writePath) {
    await writeSearchQualityReport(writePath);
    console.log(JSON.stringify({ ok: true, written: writePath }, null, 2));
    return;
  }

  console.log(JSON.stringify(await buildSearchQualityReport(), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

