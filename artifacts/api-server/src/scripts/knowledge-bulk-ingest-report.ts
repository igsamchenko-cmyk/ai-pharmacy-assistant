import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildBulkIngestReport } from "../knowledge";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const report = buildBulkIngestReport();
const out = argValue("--out=");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, written: out }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
