import { normalize } from "../lib/text";
import {
  buildRegistryMappingPlan,
  commitReviewableImportPlan,
  createDbCommitStore,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
  type KnowledgeImportCommitStore,
  type ReviewableImportPlan,
  type ReviewableImportRow,
} from "../knowledge/ingestion";

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function positionalFile(): string | null {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? null;
}

function positiveIntArg(prefix: string): number | null {
  const value = argValue(prefix);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"']+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"']+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database-url]")
    : "Registry mapping DB smoke failed.";
}

function errorMessageChain(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "string") {
      messages.push(current);
    }
    break;
  }

  return messages.join("\n") || "Registry mapping DB smoke failed.";
}

function assertNonProductionDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is required for registry mapping DB smoke.");
  }

  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const explicitlyAllowed =
    process.env.ALLOW_REGISTRY_MAPPING_DB_SMOKE_NONLOCAL === "true";

  if (host.includes("render.com") || host.includes("render-postgres")) {
    throw new Error(
      "Registry mapping DB smoke refuses production database hosts.",
    );
  }
  if (!localHosts.has(host) && !explicitlyAllowed) {
    throw new Error(
      "Registry mapping DB smoke requires a local test database unless non-local smoke is explicitly allowed.",
    );
  }
}

function uniqueApprovedRows(
  rows: readonly ReviewableImportRow[],
): ReviewableImportRow[] {
  const unique = new Map<string, ReviewableImportRow>();
  for (const item of rows) {
    if (item.reviewStatus !== "approved") {
      throw new Error("Approved mapping smoke received a non-approved row.");
    }
    const key = normalize(item.row.name);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

async function countRows(): Promise<{
  products: number;
  mappings: number;
  approved: number;
  pending: number;
  needsReview: number;
  rejected: number;
  duplicateMappings: number;
}> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{
    products: number;
    mappings: number;
    approved: number;
    pending: number;
    needs_review: number;
    rejected: number;
    duplicate_mappings: number;
  }>(
    [
      "select",
      "(select count(*)::int from knowledge_registry_products) as products,",
      "count(*)::int as mappings,",
      "count(*) filter (where review_status = 'approved')::int as approved,",
      "count(*) filter (where review_status = 'pending')::int as pending,",
      "count(*) filter (where review_status = 'needs_review')::int as needs_review,",
      "count(*) filter (where review_status = 'rejected')::int as rejected,",
      "(select count(*)::int from (",
      "select normalized from knowledge_ingredient_names",
      "group by normalized having count(*) > 1",
      ") duplicates) as duplicate_mappings",
      "from knowledge_ingredient_names",
    ].join(" "),
  );
  const row = result.rows[0];
  return {
    products: Number(row?.products ?? 0),
    mappings: Number(row?.mappings ?? 0),
    approved: Number(row?.approved ?? 0),
    pending: Number(row?.pending ?? 0),
    needsReview: Number(row?.needs_review ?? 0),
    rejected: Number(row?.rejected ?? 0),
    duplicateMappings: Number(row?.duplicate_mappings ?? 0),
  };
}

async function idleTransactionCount(): Promise<number> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{ count: number }>(
    [
      "select count(*)::int as count from pg_stat_activity",
      "where datname = current_database()",
      "and pid <> pg_backend_pid()",
      "and state = 'idle in transaction'",
    ].join(" "),
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function verifyTimeoutRollback(
  kind: "statement" | "lock",
  store: KnowledgeImportCommitStore,
  plan: ReviewableImportPlan,
  before: Awaited<ReturnType<typeof countRows>>,
): Promise<{ kind: "statement" | "lock"; rolledBack: true; sanitized: true }> {
  const { pool } = await import("@workspace/db");
  const lockClient = await pool.connect();
  let caught: unknown = null;
  try {
    await lockClient.query("begin");
    await lockClient.query(
      "lock table knowledge_ingredient_names in access exclusive mode",
    );
    try {
      await commitReviewableImportPlan(plan, {
        store,
        batchId: "registry-mapping-timeout-probe",
        approvedOnly: true,
        chunkSize: 1,
        statementTimeoutMs: kind === "statement" ? 150 : 10_000,
        lockTimeoutMs: kind === "lock" ? 150 : 10_000,
        stageTimeoutMs: 5_000,
      });
    } catch (error) {
      caught = error;
    }
  } finally {
    await lockClient.query("rollback");
    lockClient.release();
  }

  if (!caught) {
    throw new Error("Registry mapping timeout probe unexpectedly succeeded.");
  }
  const message = safeMessage(new Error(errorMessageChain(caught)));
  const expected =
    kind === "statement" ? /statement timeout/i : /lock timeout/i;
  if (!expected.test(message)) {
    throw new Error(
      "Registry mapping timeout probe returned an unexpected error.",
    );
  }
  if (
    message.includes("postgresql://") ||
    /[A-Za-z]:\\/.test(message) ||
    message.includes("/opt/render/")
  ) {
    throw new Error("Registry mapping timeout error was not sanitized.");
  }

  const after = await countRows();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      "Registry mapping timeout probe did not roll back cleanly.",
    );
  }
  if ((await idleTransactionCount()) !== 0) {
    throw new Error("Registry mapping timeout probe left an idle transaction.");
  }
  return { kind, rolledBack: true, sanitized: true };
}

async function main(): Promise<void> {
  assertNonProductionDatabaseUrl();

  const file = argValue("--file=") ?? positionalFile();
  const download = process.argv.includes("--download");
  if (!file && !download) {
    throw new Error("Provide --file=<registry.csv|tsv|json> or --download.");
  }

  const limit = positiveIntArg("--limit=");
  const expectMinMappings = positiveIntArg("--expect-min-mappings=");
  const rerun = process.argv.includes("--rerun");
  const verifyTimeouts = process.argv.includes("--verify-timeouts");
  const chunkSize = positiveIntArg("--mapping-chunk-size=") ?? 250;
  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, { snapshot: downloaded.metadata })
    : parseRegistryFile(file as string);
  const registryPlan = buildRegistryMappingPlan(registry);
  if (registryPlan.approvedCandidateConflicts > 0) {
    throw new Error("Approved mapping smoke found approved hard conflicts.");
  }
  if (registryPlan.blocked.length > 0) {
    throw new Error(
      "Registry mapping smoke blocked: " + registryPlan.blocked.join(", "),
    );
  }

  const allApproved = uniqueApprovedRows(
    registryPlan.approvedCandidatesPlan.reviewable,
  );
  const selected = limit ? allApproved.slice(0, limit) : allApproved;
  if (selected.length === 0) {
    throw new Error("Registry mapping DB smoke has zero approved rows.");
  }
  const plan: ReviewableImportPlan = {
    ...registryPlan.approvedCandidatesPlan,
    reviewable: selected,
  };

  const before = await countRows();
  const store = await createDbCommitStore();
  let report: Record<string, unknown> | null = null;
  try {
    const timeoutSafety = verifyTimeouts
      ? [
          await verifyTimeoutRollback(
            "statement",
            store,
            { ...plan, reviewable: selected.slice(0, 1) },
            before,
          ),
          await verifyTimeoutRollback(
            "lock",
            store,
            { ...plan, reviewable: selected.slice(0, 1) },
            before,
          ),
        ]
      : [];
    const first = await commitReviewableImportPlan(plan, {
      store,
      batchId: "registry-mapping-smoke-" + Date.now(),
      approvedOnly: true,
      chunkSize,
    });
    const afterFirst = await countRows();
    const persisted = first.inserted + first.updated + first.unchanged;
    const expectedMappings = expectMinMappings ?? selected.length;

    if (persisted !== selected.length || first.failed !== 0) {
      throw new Error(
        "Registry mapping DB smoke did not persist the complete approved-safe set.",
      );
    }
    if (afterFirst.approved < expectedMappings) {
      throw new Error(
        "Registry mapping DB smoke persisted fewer approved mappings than expected.",
      );
    }
    if (afterFirst.products !== before.products) {
      throw new Error("Registry mapping import changed registry products.");
    }
    if (
      afterFirst.pending !== before.pending ||
      afterFirst.needsReview !== before.needsReview ||
      afterFirst.rejected !== before.rejected
    ) {
      throw new Error("Registry mapping import persisted an excluded status.");
    }
    if (afterFirst.duplicateMappings !== 0) {
      throw new Error(
        "Registry mapping import created duplicate natural keys.",
      );
    }

    const second = rerun
      ? await commitReviewableImportPlan(plan, {
          store,
          batchId: "registry-mapping-smoke-rerun-" + Date.now(),
          approvedOnly: true,
          chunkSize,
        })
      : null;
    const afterSecond = await countRows();
    if (
      second &&
      (second.inserted !== 0 ||
        second.updated !== 0 ||
        second.unchanged !== selected.length)
    ) {
      throw new Error("Registry mapping DB smoke rerun was not idempotent.");
    }
    if (afterSecond.mappings !== afterFirst.mappings) {
      throw new Error(
        "Registry mapping DB smoke rerun changed mapping totals.",
      );
    }
    if (afterSecond.products !== before.products) {
      throw new Error("Registry mapping smoke changed products on rerun.");
    }

    const idleTransactions = await idleTransactionCount();
    if (idleTransactions !== 0) {
      throw new Error(
        "Registry mapping DB smoke left an idle transaction behind.",
      );
    }

    report = {
      ok: true,
      database: "non-production",
      source: {
        downloaded: Boolean(downloaded),
        fileProvided: Boolean(file),
        limit: limit ?? null,
      },
      plan: {
        approvedCandidates: registryPlan.approvedReviewableRows.length,
        uniqueNormalizedMappings: allApproved.length,
        selectedMappings: selected.length,
        excludedPending: registryPlan.reviewDistribution.pending,
        excludedNeedsReview: registryPlan.reviewDistribution.needs_review,
        excludedRejected: registryPlan.reviewDistribution.rejected,
        excludedQuarantined: registryPlan.reviewDistribution.quarantined,
        approvedHardConflicts: registryPlan.approvedCandidateConflicts,
      },
      first,
      rerun: second,
      counts: {
        before,
        afterFirst,
        afterSecond,
      },
      productsUnchanged: afterSecond.products === before.products,
      excludedStatusesUnchanged:
        afterSecond.pending === before.pending &&
        afterSecond.needsReview === before.needsReview &&
        afterSecond.rejected === before.rejected,
      idleTransactions,
      timeoutSafety,
    };
  } finally {
    await store.close?.();
  }

  const { pool } = await import("@workspace/db");
  const poolClosed = pool.totalCount === 0;
  if (!poolClosed) {
    throw new Error("Registry mapping DB smoke did not close the DB pool.");
  }
  console.log(JSON.stringify({ ...report, poolClosed }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
