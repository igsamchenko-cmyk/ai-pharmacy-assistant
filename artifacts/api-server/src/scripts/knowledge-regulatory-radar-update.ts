import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  importSeriesRestrictions,
  seriesRestrictionOverlapStart,
} from "../knowledge/seriesRestrictions/importer";
import { SeriesRestrictionSnapshotSchema } from "../knowledge/seriesRestrictions/model";
import { buildSeriesRestrictionUpdateCandidate } from "../knowledge/seriesRestrictions/update";
import { resolveDataFilePath, resolveWorkspacePath } from "../lib/dataPath";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown_error";
  return message
    .replace(/(?:postgres(?:ql)?):\/\/\S+/giu, "[redacted]")
    .replace(/https?:\/\/[^\s]+/giu, "[official source]")
    .slice(0, 500);
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const destination = resolveWorkspacePath(path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return destination;
}

async function main(): Promise<void> {
  if (!hasFlag("--refresh")) {
    throw new Error(
      "Regulatory radar update requires the explicit --refresh flag.",
    );
  }

  const baselinePath =
    option("baseline") ?? "data/series-restrictions/ua-dls.json";
  let candidateDestination: string | null = null;
  const candidateOutput = option("candidate-out");
  const reportOutput =
    option("report-out") ??
    "artifacts/reports/regulatory-radar-dls-update.json";
  const overlapDays = Number(option("overlap-days") ?? "45");
  if (!Number.isInteger(overlapDays) || overlapDays < 1 || overlapDays > 365) {
    throw new Error("overlap-days must be an integer from 1 to 365.");
  }

  const baseline = SeriesRestrictionSnapshotSchema.parse(
    JSON.parse(
      await readFile(
        resolveDataFilePath(baselinePath, { moduleUrl: import.meta.url }),
        "utf8",
      ),
    ),
  );
  const refreshFrom = seriesRestrictionOverlapStart(baseline, overlapDays);
  const refresh = await importSeriesRestrictions({ from: refreshFrom });
  const { candidate, report } = buildSeriesRestrictionUpdateCandidate({
    baseline,
    refresh,
    refreshFrom,
  });

  const reportDestination = await writeJson(reportOutput, report);
  if (report.status === "invalid") {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }
  if (report.status === "changed") {
    if (!candidateOutput) {
      throw new Error(
        "Official DLS data changed; pass --candidate-out to write the validated candidate snapshot.",
      );
    }
    candidateDestination = await writeJson(candidateOutput, candidate);
  }

  console.log(
    JSON.stringify(
      {
        status: report.status,
        safeToOpenPullRequest: report.safeToOpenPullRequest,
        baselineCount: report.baseline.recordCount,
        candidateCount: report.candidate.recordCount,
        addedCount: report.changes.addedCount,
        updatedCount: report.changes.updatedCount,
        removedCount: report.changes.removedCount,
        latestDocumentDate: report.candidate.latestDocumentDate,
        candidateOutput: candidateDestination,
        reportOutput: reportDestination,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
