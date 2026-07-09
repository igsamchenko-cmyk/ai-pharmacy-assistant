import { readFileSync, writeFileSync } from "node:fs";
import {
  importRowsToCsv,
  searchMissesToImportRows,
  type SearchMissCandidateInput,
} from "../knowledge";
import { buildRealWorldPharmacyReport } from "../beta/realWorldReport";
import { buildSearchQualityReport } from "../beta/searchQualityReport";
import { resolveDataFilePath } from "../lib/dataPath";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function readMisses(file: string): SearchMissCandidateInput[] {
  const parsed: unknown = JSON.parse(
    readFileSync(resolveDataFilePath(file, { moduleUrl: import.meta.url }), "utf8"),
  );
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { misses?: unknown }).misses)
      ? (parsed as { misses: unknown[] }).misses
      : [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      query: String(item.query ?? ""),
      canonicalInn: item.canonicalInn ? String(item.canonicalInn) : undefined,
      atcCode: item.atcCode ? String(item.atcCode) : undefined,
      reason: item.reason ? String(item.reason) : "search report miss",
    }));
}

async function main(): Promise<void> {
  const input = argValue("--input=");
  const misses = input
    ? readMisses(input)
    : [
        ...(await buildSearchQualityReport()).recommendedDictionaryAdditions.map((miss) => ({
          query: miss.query,
          reason: miss.reason,
        })),
        ...(await buildRealWorldPharmacyReport()).recommendedMappingsToAdd.map((miss) => ({
          query: miss.name,
          canonicalInn: miss.canonicalInn,
          reason: "real-world report recommended mapping",
        })),
      ];
  const rows = searchMissesToImportRows(misses);
  const csv = importRowsToCsv(rows);
  const out = argValue("--out=");
  if (out) {
    writeFileSync(out, csv, "utf8");
    console.log(JSON.stringify({ ok: true, written: out, rows: rows.length }, null, 2));
    return;
  }
  console.log(csv);
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
      : "Search-miss candidate generation failed.",
  );
  process.exit(1);
});
