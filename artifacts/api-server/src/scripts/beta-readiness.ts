import {
  DEFAULT_BETA_READINESS_REPORT_PATH,
  buildBetaReadinessReport,
  writeBetaReadinessReport,
} from "../beta/readiness";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main(): Promise<void> {
  const writePath = process.argv.includes("--write")
    ? (argValue("--out=") ?? DEFAULT_BETA_READINESS_REPORT_PATH)
    : null;

  if (writePath) {
    await writeBetaReadinessReport(writePath);
    console.log(JSON.stringify({ ok: true, written: writePath }, null, 2));
    return;
  }

  const report = await buildBetaReadinessReport();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.hardBlockers.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

