import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSeriesRestrictionSnapshot } from "../knowledge/seriesRestrictions/importer";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const outputArgument = argument("out");
const output = outputArgument
  ? resolve(process.cwd(), outputArgument)
  : fileURLToPath(
      new URL(
        "../../../../data/series-restrictions/ua-dls.json",
        import.meta.url,
      ),
    );

const snapshot = await writeSeriesRestrictionSnapshot(output, {
  from: argument("from"),
  to: argument("to"),
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
