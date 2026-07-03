import {
  buildKnowledgeQualityJsonReport,
  writeKnowledgeQualityJsonReport,
} from "../knowledge/qualityReport";

const DEFAULT_REPORT_PATH = "artifacts/reports/knowledge-quality-report.json";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main(): Promise<void> {
  const writePath = process.argv.includes("--write")
    ? (argValue("--out=") ?? DEFAULT_REPORT_PATH)
    : null;

  if (writePath) {
    await writeKnowledgeQualityJsonReport(writePath);
    console.log(JSON.stringify({ ok: true, written: writePath }, null, 2));
    return;
  }

  const report = await buildKnowledgeQualityJsonReport();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

