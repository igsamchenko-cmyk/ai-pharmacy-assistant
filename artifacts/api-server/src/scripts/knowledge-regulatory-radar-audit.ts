import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveDataFilePath } from "../lib/dataPath";
import { importSeriesRestrictions } from "../knowledge/seriesRestrictions/importer";
import { SeriesRestrictionSnapshotSchema } from "../knowledge/seriesRestrictions/model";
import { importDispensingCategories } from "../knowledge/dispensingCategories/importer";
import { DispensingCategorySnapshotSchema } from "../knowledge/dispensingCategories/model";
import { importPriceCatalog } from "../knowledge/priceCatalog/importer";
import { PriceCatalogSnapshotSchema } from "../knowledge/priceCatalog/model";
import { importReimbursement } from "../knowledge/reimbursement/importer";
import { ReimbursementSnapshotSchema } from "../knowledge/reimbursement/model";
import {
  downloadAndParseNationalList,
  evaluateNationalListActivation,
  type NationalListSnapshot,
} from "../knowledge/nationalList";

type SourceKey =
  | "series_restrictions"
  | "dispensing_categories"
  | "reimbursement"
  | "price_catalog"
  | "national_list";

interface SourceAuditResult {
  key: SourceKey;
  status: "unchanged" | "changed" | "unavailable" | "invalid";
  baselineHash: string;
  candidateHash: string | null;
  baselineCount: number;
  candidateCount: number | null;
  countDelta: number | null;
  baselineDate: string | null;
  candidateDate: string | null;
  reason: string;
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(resolveDataFilePath(path), "utf8"));
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown_error";
  return message
    .replace(/(?:postgres(?:ql)?):\/\/\S+/giu, "[redacted]")
    .replace(/https?:\/\/[^\s]+/giu, "[official source]")
    .slice(0, 300);
}

async function guarded(
  key: SourceKey,
  baseline: Omit<
    SourceAuditResult,
    | "key"
    | "status"
    | "candidateHash"
    | "candidateCount"
    | "countDelta"
    | "candidateDate"
    | "reason"
  >,
  run: () => Promise<{
    hash: string;
    count: number;
    date: string | null;
    valid: boolean;
    reason?: string;
  }>,
): Promise<SourceAuditResult> {
  try {
    const candidate = await run();
    const changed = candidate.hash !== baseline.baselineHash;
    return {
      key,
      status: candidate.valid ? (changed ? "changed" : "unchanged") : "invalid",
      ...baseline,
      candidateHash: candidate.hash,
      candidateCount: candidate.count,
      countDelta: candidate.count - baseline.baselineCount,
      candidateDate: candidate.date,
      reason:
        candidate.reason ??
        (changed
          ? "Official source content differs from the reviewed snapshot."
          : "Official source content matches the reviewed snapshot."),
    };
  } catch (error) {
    return {
      key,
      status: "unavailable",
      ...baseline,
      candidateHash: null,
      candidateCount: null,
      countDelta: null,
      candidateDate: null,
      reason: safeMessage(error),
    };
  }
}

async function main(): Promise<void> {
  if (!hasFlag("--refresh")) {
    throw new Error(
      "Regulatory source audit requires the explicit --refresh flag.",
    );
  }

  const generatedAt = new Date().toISOString();
  const series = SeriesRestrictionSnapshotSchema.parse(
    loadJson("data/series-restrictions/ua-dls.json"),
  );
  const dispensing = DispensingCategorySnapshotSchema.parse(
    loadJson("data/dispensing-categories/ua-drlz.json"),
  );
  const reimbursement = ReimbursementSnapshotSchema.parse(
    loadJson("data/reimbursement/ua-nszu-2026-07-17.json"),
  );
  const price = PriceCatalogSnapshotSchema.parse(
    loadJson("data/price-catalog/ua-moz-2026-07-01.json"),
  );
  const nationalList = loadJson(
    "data/national-list/ua-2025-10-10.json",
  ) as NationalListSnapshot;
  const nationalGate = evaluateNationalListActivation(nationalList);
  if (!nationalGate.ready) {
    throw new Error(
      `Reviewed national-list baseline is invalid: ${nationalGate.blockers.join(" ")}`,
    );
  }

  const results = await Promise.all([
    guarded(
      "series_restrictions",
      {
        baselineHash: series.source.sha256,
        baselineCount: series.source.recordCount,
        baselineDate: series.source.latestDocumentDate,
      },
      async () => {
        const candidate = await importSeriesRestrictions();
        const minimumSafeCount = Math.floor(series.source.recordCount * 0.7);
        const countIsPlausible =
          candidate.source.recordCount >= minimumSafeCount;
        return {
          hash: candidate.source.sha256,
          count: candidate.source.recordCount,
          date: candidate.source.latestDocumentDate,
          valid:
            candidate.source.complete &&
            candidate.warnings.length === 0 &&
            countIsPlausible,
          reason: !countIsPlausible
            ? `Candidate DLS record count is below the 70% anomaly gate: ${candidate.source.recordCount} < ${minimumSafeCount}.`
            : candidate.source.complete
              ? undefined
              : "Candidate DLS export is incomplete.",
        };
      },
    ),
    guarded(
      "dispensing_categories",
      {
        baselineHash: dispensing.source.recordsSha256,
        baselineCount: dispensing.source.recordCount,
        baselineDate: dispensing.source.checkedAt.slice(0, 10),
      },
      async () => {
        const candidate = await importDispensingCategories();
        return {
          hash: candidate.source.recordsSha256,
          count: candidate.source.recordCount,
          date: candidate.source.checkedAt.slice(0, 10),
          valid: candidate.source.complete,
          reason: candidate.source.complete
            ? undefined
            : "Candidate DRLZ export is incomplete.",
        };
      },
    ),
    guarded(
      "reimbursement",
      {
        baselineHash: reimbursement.source.recordsSha256,
        baselineCount: reimbursement.source.recordCount,
        baselineDate: reimbursement.source.releaseDate,
      },
      async () => {
        const candidate = await importReimbursement({
          releaseDate: reimbursement.source.releaseDate,
        });
        return {
          hash: candidate.source.recordsSha256,
          count: candidate.source.recordCount,
          date: candidate.source.releaseDate,
          valid: candidate.source.complete,
          reason: candidate.source.complete
            ? undefined
            : "Candidate reimbursement document is incomplete.",
        };
      },
    ),
    guarded(
      "price_catalog",
      {
        baselineHash: price.source.recordsSha256,
        baselineCount: price.source.recordCount,
        baselineDate: price.source.releaseDate,
      },
      async () => {
        const candidate = await importPriceCatalog({
          releaseDate: price.source.releaseDate,
        });
        return {
          hash: candidate.source.recordsSha256,
          count: candidate.source.recordCount,
          date: candidate.source.releaseDate,
          valid: candidate.source.complete,
          reason: candidate.source.complete
            ? undefined
            : "Candidate price catalog is incomplete.",
        };
      },
    ),
    guarded(
      "national_list",
      {
        baselineHash: nationalList.source.documentHash,
        baselineCount: nationalList.counts.valid,
        baselineDate: nationalList.source.revisionDate,
      },
      async () => {
        const candidate = await downloadAndParseNationalList();
        const gate = evaluateNationalListActivation(candidate, nationalList);
        return {
          hash: candidate.source.documentHash,
          count: candidate.counts.valid,
          date: candidate.source.revisionDate,
          valid: gate.ready,
          reason: gate.ready ? undefined : gate.blockers.join(" "),
        };
      },
    ),
  ]);

  const changedCount = results.filter(
    (result) => result.status === "changed",
  ).length;
  const unavailableCount = results.filter(
    (result) => result.status === "unavailable",
  ).length;
  const invalidCount = results.filter(
    (result) => result.status === "invalid",
  ).length;
  const report = {
    schemaVersion: "regulatory-radar-source-audit-v1",
    generatedAt,
    mode: "read_only",
    safeToApplyAutomatically: false,
    summary: {
      sourceCount: results.length,
      unchangedCount:
        results.length - changedCount - unavailableCount - invalidCount,
      changedCount,
      unavailableCount,
      invalidCount,
      requiresReview: changedCount + unavailableCount + invalidCount > 0,
    },
    sources: results,
  };

  const output = option("out");
  if (output) {
    const destination = resolve(process.cwd(), output);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
  if (hasFlag("--fail-on-change") && report.summary.requiresReview) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
