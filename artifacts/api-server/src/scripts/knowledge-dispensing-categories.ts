import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeDispensingCategorySnapshot } from "../knowledge/dispensingCategories/importer";

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
        "../../../../data/dispensing-categories/ua-drlz.json",
        import.meta.url,
      ),
    );

const snapshot = await writeDispensingCategorySnapshot(output);

console.log(
  JSON.stringify(
    {
      output,
      generatedAt: snapshot.generatedAt,
      officialRowCount: snapshot.source.officialRowCount,
      recordCount: snapshot.source.recordCount,
      categoryCounts: snapshot.source.categoryCounts,
      missingConditionsCount: snapshot.source.missingConditionsCount,
      complete: snapshot.source.complete,
      sha256: snapshot.source.sha256,
    },
    null,
    2,
  ),
);
