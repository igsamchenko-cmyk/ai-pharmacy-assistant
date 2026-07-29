import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePriceCatalogWorkbook,
  writePriceCatalogSnapshot,
} from "../knowledge/priceCatalog/importer";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const output = argument("out")
  ? resolve(process.cwd(), argument("out") as string)
  : fileURLToPath(
      new URL(
        "../../../../data/price-catalog/ua-moz-2026-07-01.json",
        import.meta.url,
      ),
    );
const releaseDate = argument("release-date") ?? "2026-07-01";
const input = argument("file");
const snapshot = input
  ? await (async () => {
      const bytes = await readFile(resolve(process.cwd(), input));
      const parsed = await parsePriceCatalogWorkbook(bytes, {
        releaseDate,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        contentLength: bytes.length,
      });
      if (!parsed.source.complete)
        throw new Error("price_catalog_snapshot_incomplete");
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      return parsed;
    })()
  : await writePriceCatalogSnapshot(output, { releaseDate });

console.log(
  JSON.stringify(
    {
      output,
      generatedAt: snapshot.generatedAt,
      officialRowCount: snapshot.source.officialRowCount,
      recordCount: snapshot.source.recordCount,
      complete: snapshot.source.complete,
      sha256: snapshot.source.sha256,
      warnings: snapshot.warnings,
    },
    null,
    2,
  ),
);
