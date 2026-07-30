import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeSeriesRestrictionSnapshot } from "../knowledge/seriesRestrictions/importer";
import { SeriesRestrictionSnapshotSchema } from "../knowledge/seriesRestrictions/model";
import { resolveDataFilePath } from "../lib/dataPath";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const outputArgument = argument("out");
const output = outputArgument
  ? resolveDataFilePath(outputArgument, { moduleUrl: import.meta.url })
  : fileURLToPath(
      new URL(
        "../../../../data/series-restrictions/ua-dls.json",
        import.meta.url,
      ),
    );

const mergeExisting = argument("merge-existing");
const previousSnapshot = mergeExisting
  ? SeriesRestrictionSnapshotSchema.parse(
      JSON.parse(
        await readFile(
          resolveDataFilePath(mergeExisting, { moduleUrl: import.meta.url }),
          "utf8",
        ),
      ),
    )
  : undefined;
const overlapDays = Number(argument("overlap-days") ?? "45");
if (!Number.isInteger(overlapDays) || overlapDays < 1 || overlapDays > 365) {
  throw new Error("overlap-days must be an integer from 1 to 365.");
}

const snapshot = await writeSeriesRestrictionSnapshot(output, {
  from: argument("from"),
  to: argument("to"),
  previousSnapshot,
  overlapDays,
});

console.log(
  JSON.stringify(
    {
      output,
      generatedAt: snapshot.generatedAt,
      recordCount: snapshot.source.recordCount,
      latestDocumentDate: snapshot.source.latestDocumentDate,
      complete: snapshot.source.complete,
      requestCount: snapshot.source.requestCount,
      sha256: snapshot.source.sha256,
    },
    null,
    2,
  ),
);
