import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseReimbursementPdf,
  writeReimbursementSnapshot,
} from "../knowledge/reimbursement/importer";
import { resolveDataFilePath } from "../lib/dataPath";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const output = argument("out")
  ? resolveDataFilePath(argument("out") as string, {
      moduleUrl: import.meta.url,
    })
  : fileURLToPath(
      new URL(
        "../../../../data/reimbursement/ua-nszu-2026-07-17.json",
        import.meta.url,
      ),
    );
const releaseDate = argument("release-date") ?? "2026-07-17";
const input = argument("file");
const snapshot = input
  ? await (async () => {
      const bytes = await readFile(resolve(process.cwd(), input));
      const parsed = await parseReimbursementPdf(bytes, {
        releaseDate,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        contentLength: bytes.length,
      });
      if (!parsed.source.complete)
        throw new Error("reimbursement_snapshot_incomplete");
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      return parsed;
    })()
  : await writeReimbursementSnapshot(output, { releaseDate });

console.log(
  JSON.stringify(
    {
      output,
      generatedAt: snapshot.generatedAt,
      recordCount: snapshot.source.recordCount,
      sectionCounts: snapshot.source.sectionCounts,
      parsedDocumentPositionCount: snapshot.source.parsedDocumentPositionCount,
      complete: snapshot.source.complete,
      sha256: snapshot.source.sha256,
      warnings: snapshot.warnings,
    },
    null,
    2,
  ),
);
