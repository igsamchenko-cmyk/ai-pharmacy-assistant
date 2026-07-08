import {
  DEFAULT_REAL_WORLD_PHARMACY_REPORT_PATH,
  buildRealWorldPharmacyReport,
  writeRealWorldPharmacyReport,
} from "../beta/realWorldReport";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Real-world pharmacy report failed.";
  return error.message
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
    .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]");
}

async function main(): Promise<void> {
  const writePath = process.argv.includes("--write")
    ? (argValue("--out=") ?? DEFAULT_REAL_WORLD_PHARMACY_REPORT_PATH)
    : null;

  if (writePath) {
    await writeRealWorldPharmacyReport(writePath);
    console.log(JSON.stringify({ ok: true, written: writePath }, null, 2));
    return;
  }

  console.log(JSON.stringify(await buildRealWorldPharmacyReport(), null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
