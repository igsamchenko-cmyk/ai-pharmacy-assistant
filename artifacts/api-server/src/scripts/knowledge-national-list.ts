import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveDataFilePath } from "../lib/dataPath";
import {
  activateNationalListRelease,
  commitNationalListSnapshot,
  diffNationalListSnapshots,
  downloadAndParseNationalList,
  evaluateNationalListActivation,
  resolveNationalListMatch,
  rollbackNationalListRelease,
  type NationalListProductInput,
  type NationalListSnapshot,
} from "../knowledge/nationalList";

const SNAPSHOT_PATH = "data/national-list/ua-2025-10-10.json";

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function optionValue(prefix: string): string | undefined {
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function loadSnapshot(): NationalListSnapshot {
  const path = resolveDataFilePath(SNAPSHOT_PATH, { moduleUrl: import.meta.url });
  return JSON.parse(readFileSync(path, "utf8")) as NationalListSnapshot;
}

const representativeProducts: NationalListProductInput[] = [
  { registryId: "paracetamol", inn: "Paracetamol", activeIngredient: "Paracetamol 500 mg", dosageForm: "таблетки: 500 мг" },
  { registryId: "ibuprofen", inn: "Ibuprofen", activeIngredient: "Ibuprofen 200 mg", dosageForm: "таблетки: 200 мг" },
  { registryId: "metformin", inn: "Metformin", activeIngredient: "Metformin 500 mg", dosageForm: "таблетки: 500 мг" },
  { registryId: "amlodipine", inn: "Amlodipine", activeIngredient: "Amlodipine 5 mg", dosageForm: "таблетки: 5 мг" },
  { registryId: "omeprazole", inn: "Omeprazole", activeIngredient: "Omeprazole 20 mg", dosageForm: "капсули: 20 мг" },
  { registryId: "ceftriaxone", inn: "Ceftriaxone", activeIngredient: "Ceftriaxone 1 g", dosageForm: "порошок для ін'єкцій: 1 г" },
  { registryId: "warfarin", inn: "Warfarin", activeIngredient: "Warfarin 5 mg", dosageForm: "таблетки: 5 мг" },
  { registryId: "apixaban", inn: "Apixaban", activeIngredient: "Apixaban 5 mg", dosageForm: "таблетки: 5 мг" },
  { registryId: "lisinopril-hctz", inn: "Lisinopril + Hydrochlorothiazide", activeIngredient: "10 mg/12.5 mg", dosageForm: "таблетки: 10 мг/12,5 мг" },
  { registryId: "unlisted-combination", inn: "Paracetamol + Ibuprofen", activeIngredient: "500 mg + 200 mg", dosageForm: "таблетки" },
];

function buildReport(snapshot: NationalListSnapshot) {
  const gate = evaluateNationalListActivation(snapshot);
  const matches = representativeProducts.map((product) => ({
    id: product.registryId,
    ...resolveNationalListMatch(product, snapshot.entries, { activeRelease: true }),
  }));
  const distribution = matches.reduce<Record<string, number>>((counts, match) => {
    counts[match.status] = (counts[match.status] ?? 0) + 1;
    return counts;
  }, {});
  return {
    releaseId: snapshot.releaseId,
    status: snapshot.status,
    source: snapshot.source,
    counts: snapshot.counts,
    parserErrors: snapshot.errors,
    diff: diffNationalListSnapshots(snapshot),
    activationGate: gate,
    matchReport: { total: matches.length, distribution, matches },
    dryRun: !hasFlag("--commit"),
  };
}

async function main(): Promise<void> {
  const commit = hasFlag("--commit");
  const requireDb = hasFlag("--require-db");
  const activate = hasFlag("--activate");
  const rollbackTo = optionValue("--rollback-to=");
  if ((commit || activate || rollbackTo) && !requireDb) {
    throw new Error("Database writes require the explicit --require-db flag.");
  }
  if ((commit || activate || rollbackTo) && !process.env.DATABASE_URL) {
    throw new Error("Database writes require a configured database connection.");
  }
  if (activate && !commit) throw new Error("Activation requires --commit and --require-db.");
  if (rollbackTo && !commit) throw new Error("Rollback requires --commit and --require-db.");
  if (rollbackTo) {
    if (process.env.CONFIRM_NATIONAL_LIST_ACTIVATION !== rollbackTo) {
      throw new Error("Rollback requires release-specific activation confirmation.");
    }
    console.log(JSON.stringify({ action: "rollback", ...(await rollbackNationalListRelease(rollbackTo)) }, null, 2));
    return;
  }

  const snapshot = hasFlag("--download")
    ? await downloadAndParseNationalList()
    : loadSnapshot();
  if (hasFlag("--write-snapshot")) {
    if (!hasFlag("--download")) throw new Error("Snapshot writing requires --download.");
    const gate = evaluateNationalListActivation(snapshot);
    if (!gate.ready) throw new Error(`Snapshot writing blocked: ${gate.blockers.join(" ")}`);
    const destination = resolve(process.cwd(), SNAPSHOT_PATH);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  const report = buildReport(snapshot);
  if (!commit) {
    const output = hasFlag("--source-report")
      ? {
          releaseId: report.releaseId,
          status: report.status,
          source: report.source,
          counts: report.counts,
          parserErrors: report.parserErrors,
          diff: report.diff,
          activationGate: report.activationGate,
          dryRun: true,
        }
      : hasFlag("--match-report")
        ? {
            releaseId: report.releaseId,
            status: report.status,
            matchReport: report.matchReport,
            dryRun: true,
          }
        : report;
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  const committed = await commitNationalListSnapshot(snapshot);
  let activated = null;
  if (activate) {
    if (process.env.CONFIRM_NATIONAL_LIST_ACTIVATION !== snapshot.releaseId) {
      throw new Error("Activation requires release-specific activation confirmation.");
    }
    activated = await activateNationalListRelease(snapshot);
  }
  console.log(JSON.stringify({ ...report, dryRun: false, committed, activated }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "National-list command failed.";
  console.error(message.replace(/(?:postgres(?:ql)?):\/\/\S+/giu, "[redacted]"));
  process.exitCode = 1;
});
