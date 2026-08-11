import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDataFilePath } from "../lib/dataPath";
import {
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
  type RegistryParseResult,
} from "../knowledge/ingestion";
import {
  getInstructionForProduct,
  loadInstructionManifest,
  loadInstructionSources,
} from "../knowledge/instructions/catalog";
import {
  buildInstructionFetchQueuePlan,
  DEFAULT_INSTRUCTION_QUEUE_TARGET,
  type InstructionQueueRegistryMetadata,
} from "../knowledge/instructions/fetchQueue";
import {
  commitInstructionFetchQueuePlan,
  requeueFailedInstructionFetchJobs,
  scheduleInstructionHashRefresh,
} from "../knowledge/instructions/fetchQueueRepository";
import { runInstructionFetchWorker } from "../knowledge/instructions/fetchQueueWorker";
import type { DrugInstructionSnapshot } from "../knowledge/instructions/model";
import type { NationalListSnapshot } from "../knowledge/nationalList";

const NATIONAL_LIST_PATH = "data/national-list/ua-2025-10-10.json";

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function optionValue(prefix: string): string | null {
  return (
    process.argv
      .slice(2)
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function integerOption(
  prefix: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = optionValue(prefix);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error("instruction_queue_argument_invalid");
  }
  return value;
}

function requireDatabaseMutation(): void {
  if (!hasFlag("--require-db")) {
    throw new Error("instruction_queue_database_flag_required");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("instruction_queue_database_connection_required");
  }
}

async function loadRegistry(file: string | null): Promise<RegistryParseResult> {
  if (file) return parseRegistryFile(resolve(file));
  const downloaded = await downloadOfficialRegistrySnapshot();
  return parseRegistryText(downloaded.text, { snapshot: downloaded.metadata });
}

function registryMetadata(
  registry: RegistryParseResult,
): InstructionQueueRegistryMetadata {
  return registry.snapshot
    ? {
        sourceUrl: registry.snapshot.sourceUrl ?? "offline-file",
        sha256: registry.snapshot.sha256 ?? "",
        checkedAt: registry.snapshot.downloadedAt ?? new Date(0).toISOString(),
      }
    : {
        sourceUrl: "offline-file",
        sha256: "",
        checkedAt: new Date(0).toISOString(),
      };
}

function loadExistingSnapshots(): DrugInstructionSnapshot[] {
  return loadInstructionManifest().products.map((product) => {
    const snapshot = getInstructionForProduct(product.registryProductId);
    if (!snapshot) throw new Error("instruction_existing_snapshot_missing");
    return snapshot;
  });
}

function loadNationalList(): NationalListSnapshot {
  return JSON.parse(
    readFileSync(
      resolveDataFilePath(NATIONAL_LIST_PATH, { moduleUrl: import.meta.url }),
      "utf8",
    ),
  ) as NationalListSnapshot;
}

function safeCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9:_-]{1,120}$/iu.test(error.message)) {
    return error.message;
  }
  return "instruction_queue_command_failed";
}

async function runWorker(): Promise<void> {
  requireDatabaseMutation();
  const sources = loadInstructionSources();
  const report = await runInstructionFetchWorker(
    {
      title: sources.dataset.title,
      url: sources.dataset.url,
      license: sources.dataset.license,
    },
    {
      limit: integerOption("--limit=", 20, 1, 100),
      concurrency: integerOption("--concurrency=", 2, 1, 4),
      minimumSectionCount: integerOption("--min-sections=", 8, 1, 9),
      startIntervalMs: integerOption("--start-interval-ms=", 300, 250, 5_000),
      workerId: optionValue("--worker-id=") ?? undefined,
    },
  );
  console.log(
    JSON.stringify(
      { ok: report.failedCount === 0, mode: "work", ...report },
      null,
      2,
    ),
  );
  if (report.failedCount > 0) process.exitCode = 1;
}

async function scheduleRefresh(): Promise<void> {
  requireDatabaseMutation();
  const refreshAgeDays = integerOption("--refresh-age-days=", 7, 1, 90);
  const scheduledCount = await scheduleInstructionHashRefresh(refreshAgeDays);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "schedule-hash-refresh",
        refreshAgeDays,
        scheduledCount,
      },
      null,
      2,
    ),
  );
}

async function requeueFailed(): Promise<void> {
  requireDatabaseMutation();
  const errorCode = optionValue("--error-code=");
  if (!errorCode)
    throw new Error("instruction_queue_requeue_error_code_required");
  const limit = integerOption("--limit=", 20, 1, 100);
  const requeuedCount = await requeueFailedInstructionFetchJobs(
    errorCode,
    limit,
  );
  console.log(
    JSON.stringify(
      { ok: true, mode: "requeue-failed", errorCode, limit, requeuedCount },
      null,
      2,
    ),
  );
}

async function planOrCommit(): Promise<void> {
  const commit = hasFlag("--commit");
  const file = optionValue("--file=");
  if (commit) {
    requireDatabaseMutation();
    if (file)
      throw new Error("instruction_queue_commit_requires_fresh_registry");
  }
  const registry = await loadRegistry(file);
  if (registry.parseErrors.length) {
    throw new Error("instruction_queue_registry_parse_failed");
  }
  const existingSnapshots = loadExistingSnapshots();
  const nationalList = loadNationalList();
  const targetCount = integerOption(
    "--target=",
    DEFAULT_INSTRUCTION_QUEUE_TARGET,
    1,
    2_500,
  );
  const sampleSize = integerOption("--sample=", 20, 0, 50);
  const plan = buildInstructionFetchQueuePlan(
    registry.rows,
    existingSnapshots,
    nationalList.entries,
    registryMetadata(registry),
    targetCount,
  );
  if (commit) {
    const committed = await commitInstructionFetchQueuePlan(
      plan,
      existingSnapshots,
    );
    console.log(
      JSON.stringify(
        { ok: true, mode: "commit", ...plan.summary, committed },
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "preview",
        targetCount: plan.targetCount,
        registry: plan.registry,
        nationalListReleaseId: nationalList.releaseId,
        summary: plan.summary,
        invalidMetadataFieldCounts: plan.invalidMetadataFieldCounts,
        prioritySample: plan.candidates
          .slice(0, sampleSize)
          .map((candidate) => ({
            registryProductId: candidate.source.registryProductId,
            registrationNumber: candidate.source.registrationNumber,
            tradeName: candidate.source.tradeName,
            inn: candidate.source.inn,
            dosageForm: candidate.source.dosageForm,
            priorityTier: candidate.priorityTier,
            priorityReason: candidate.priorityReason,
            nationalListStatus: candidate.nationalListStatus,
            status: candidate.status,
          })),
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const modes = [
    hasFlag("--work"),
    hasFlag("--schedule-refresh"),
    hasFlag("--requeue-failed"),
    hasFlag("--commit"),
  ].filter(Boolean);
  if (modes.length > 1) throw new Error("instruction_queue_mode_conflict");
  if (hasFlag("--work")) return runWorker();
  if (hasFlag("--schedule-refresh")) return scheduleRefresh();
  if (hasFlag("--requeue-failed")) return requeueFailed();
  return planOrCommit();
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: safeCode(error) }));
  process.exitCode = 1;
});
