import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  buildOfficialRegistryAudit,
  buildRegistryMappingPlan,
  commitRegistryProducts,
  compareRegistryParity,
  createDbCommitStore,
  downloadOfficialRegistrySnapshot,
  parseRegistryBuffer,
  parseRegistryText,
  registryAnomalyFailures,
  type RegistryComparableProduct,
  type RegistryParseResult,
} from "../knowledge/ingestion";

const DEFAULT_REPORT =
  "../../artifacts/reports/official-registry-parity-report.json";
const DEFAULT_BASELINE =
  "../../artifacts/reports/catalog-completeness-report.json";

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function flag(value: string): boolean {
  return process.argv.includes(value);
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"']+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"']+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database-url]")
    : "Official registry parity failed.";
}

function parseSource(): Promise<RegistryParseResult> | RegistryParseResult {
  const file = argValue("--file=");
  if (flag("--download")) {
    return downloadOfficialRegistrySnapshot().then((snapshot) =>
      parseRegistryText(snapshot.text, {
        includeTradeNames: true,
        snapshot: snapshot.metadata,
      }),
    );
  }
  if (!file)
    throw new Error("Provide --download or --file=<fresh-official.csv>.");
  const resolvedFile = resolve(file);
  return parseRegistryBuffer(readFileSync(resolvedFile), {
    includeTradeNames: true,
    fileName: basename(resolvedFile),
    sourceUrl: argValue("--source-url="),
    downloadedAt: argValue("--downloaded-at="),
  });
}

function readBaseline(path: string) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8")) as {
      source?: { sha256?: string; contentLength?: number; sourceUrl?: string };
      counts?: { rawRows?: number; registryRows?: number };
    };
  } catch {
    return null;
  }
}

interface DbRegistryRow {
  registry_id: string;
  trade_name: string;
  normalized_trade_name: string;
  inn: string;
  active_ingredient: string;
  atc_code: string | null;
  form: string;
  strength?: string;
  applicant_name: string;
  applicant_country: string;
  registration_number: string;
  registration_start_date: string;
  registration_end_date: string;
  registry_status?: string;
  early_termination: string;
  instruction_url: string | null;
  current_status?: string;
  source_snapshot_hash?: string | null;
  import_batch_id: string | null;
  manufacturers: { name: string; country: string }[] | null;
}

function comparable(row: DbRegistryRow): RegistryComparableProduct {
  return {
    registryId: row.registry_id,
    tradeName: row.trade_name,
    normalizedTradeName: row.normalized_trade_name,
    inn: row.inn,
    activeIngredient: row.active_ingredient,
    atcCode: row.atc_code ?? "",
    form: row.form,
    strength: row.strength ?? "",
    applicantName: row.applicant_name,
    applicantCountry: row.applicant_country,
    manufacturers: Array.isArray(row.manufacturers) ? row.manufacturers : [],
    registrationNumber: row.registration_number,
    registrationStartDate: row.registration_start_date,
    registrationEndDate: row.registration_end_date,
    status: row.registry_status ?? "",
    earlyTermination: row.early_termination,
    instructionUrl: row.instruction_url ?? "",
    currentStatus: row.current_status === "stale" ? "stale" : "current",
    sourceSnapshotHash: row.source_snapshot_hash ?? null,
    importBatchId: row.import_batch_id,
  };
}

async function loadDatabaseRows(): Promise<RegistryComparableProduct[] | null> {
  if (!process.env.DATABASE_URL) return null;
  const { pool } = await import("@workspace/db");
  const currentSql = `
    SELECT p.registry_id, p.trade_name, p.normalized_trade_name, p.inn,
           p.active_ingredient, p.atc_code, p.form, p.strength,
           p.applicant_name, p.applicant_country, p.registration_number,
           p.registration_start_date, p.registration_end_date,
           ''::text AS registry_status, p.early_termination, p.instruction_url,
           p.current_status, p.source_snapshot_hash, p.import_batch_id,
           COALESCE(
             json_agg(json_build_object('name', m.name, 'country', m.country)
               ORDER BY lower(m.name), lower(m.country))
               FILTER (WHERE m.id IS NOT NULL),
             '[]'::json
           ) AS manufacturers
      FROM knowledge_registry_products p
      LEFT JOIN knowledge_registry_manufacturers m
        ON m.product_registry_id = p.registry_id
     GROUP BY p.registry_id
     ORDER BY p.registry_id`;
  try {
    const result = await pool.query<DbRegistryRow>(currentSql);
    return result.rows.map(comparable);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/(current_status|source_snapshot_hash|strength)/i.test(message))
      throw error;
    const legacy = await pool.query<DbRegistryRow>(`
      SELECT p.registry_id, p.trade_name, p.normalized_trade_name, p.inn,
             p.active_ingredient, p.atc_code, p.form,
             p.applicant_name, p.applicant_country, p.registration_number,
             p.registration_start_date, p.registration_end_date,
             ''::text AS registry_status, p.early_termination, p.instruction_url,
             'current'::text AS current_status,
             NULL::text AS source_snapshot_hash, p.import_batch_id,
             COALESCE(
               json_agg(json_build_object('name', m.name, 'country', m.country)
                 ORDER BY lower(m.name), lower(m.country))
                 FILTER (WHERE m.id IS NOT NULL),
               '[]'::json
             ) AS manufacturers
        FROM knowledge_registry_products p
        LEFT JOIN knowledge_registry_manufacturers m
          ON m.product_registry_id = p.registry_id
       GROUP BY p.registry_id
       ORDER BY p.registry_id`);
    return legacy.rows.map(comparable);
  }
}

function plannedAfterParity(officialRows: number) {
  return {
    farmAssistCurrentRows: officialRows,
    missingOfficialRows: 0,
    missingOfficialActiveRows: 0,
    missingOfficialTradeNames: 0,
    unintendedStaleRowsShownCurrent: 0,
    officialRowsIncorrectlyMarkedStale: 0,
    silentlyExcludedUnmappedRows: 0,
    changedRows: 0,
    exactParity: true,
  };
}

async function applySync(options: {
  registry: RegistryParseResult;
  databaseRows: RegistryComparableProduct[];
  sourceHash: string;
  sourceUrl: string;
  downloadedAt: string;
  anomalyFailures: string[];
}) {
  const confirmation = argValue("--confirm-apply=")?.toLowerCase() ?? null;
  if (confirmation !== options.sourceHash) {
    throw new Error(
      "--confirm-apply must exactly match the fresh source SHA-256.",
    );
  }
  if (options.anomalyFailures.length > 0) {
    throw new Error(
      `Registry apply blocked by anomaly gate: ${options.anomalyFailures.join(", ")}`,
    );
  }
  const checkpointArtifact = argValue("--checkpoint-artifact=");
  if (!checkpointArtifact) {
    throw new Error("--checkpoint-artifact is required for an apply run.");
  }
  const { pool } = await import("@workspace/db");
  const checkpointSourceHash =
    options.databaseRows.find((row) => row.currentStatus === "current")
      ?.sourceSnapshotHash ?? null;
  const syncId = `registry-sync-${options.sourceHash}-${new Date().toISOString()}`;
  const before = compareRegistryParity(options.registry, options.databaseRows);
  await pool.query(
    `INSERT INTO knowledge_registry_sync_runs (
       id, mode, status, source_url, source_hash, source_timestamp,
       official_rows, farmassist_rows_before, missing_count, extra_count,
       changed_count, parity_status, anomaly_failures,
       checkpoint_source_hash, checkpoint_artifact
     ) VALUES ($1, 'apply', 'running', $2, $3, $4, $5, $6, $7, $8, $9,
               'pending', $10, $11, $12)`,
    [
      syncId,
      options.sourceUrl,
      options.sourceHash,
      options.downloadedAt,
      options.registry.rows.length,
      options.databaseRows.length,
      before.missingOfficialRows ?? 0,
      before.extraFarmAssistRows ?? 0,
      before.changed?.any ?? 0,
      JSON.stringify(options.anomalyFailures),
      checkpointSourceHash,
      checkpointArtifact,
    ],
  );

  const store = await createDbCommitStore();
  try {
    const products = await commitRegistryProducts(options.registry.rows, {
      store,
      batchId: syncId,
    });
    const stale = await pool.query(
      `UPDATE knowledge_registry_products
          SET current_status = 'stale', review_status = 'stale', updated_at = NOW()
        WHERE source_key = $1
          AND current_status <> 'stale'
          AND (source_snapshot_hash IS DISTINCT FROM $2 OR import_batch_id <> $3)`,
      [options.registry.sourceId, options.sourceHash, syncId],
    );
    const afterRows = (await loadDatabaseRows()) ?? [];
    const after = compareRegistryParity(options.registry, afterRows);
    await pool.query(
      `UPDATE knowledge_registry_sync_runs
          SET status = $2, farmassist_rows_after = $3,
              stale_marked_count = $4, parity_status = $5,
              missing_count = $6, extra_count = $7, changed_count = $8,
              completed_at = NOW()
        WHERE id = $1`,
      [
        syncId,
        after.exactParity ? "completed" : "failed",
        after.farmAssistCurrentRows ?? 0,
        stale.rowCount ?? 0,
        after.exactParity ? "exact" : "mismatch",
        after.missingOfficialRows ?? 0,
        after.extraFarmAssistRows ?? 0,
        after.changed?.any ?? 0,
      ],
    );
    if (!after.exactParity) {
      throw new Error("Post-apply exact parity verification failed.");
    }
    return { syncId, products, staleMarked: stale.rowCount ?? 0, after };
  } catch (error) {
    await pool.query(
      `UPDATE knowledge_registry_sync_runs
          SET status = 'failed', parity_status = 'mismatch', completed_at = NOW()
        WHERE id = $1`,
      [syncId],
    );
    throw error;
  } finally {
    await store.close?.();
  }
}

async function main(): Promise<void> {
  const registry = await parseSource();
  const audit = buildOfficialRegistryAudit(registry);
  const plan = buildRegistryMappingPlan(registry);
  const baselinePath = argValue("--baseline-report=") ?? DEFAULT_BASELINE;
  const baseline = readBaseline(baselinePath);
  const databaseRows = await loadDatabaseRows();
  if (flag("--require-db") && !databaseRows) {
    throw new Error("DATABASE_URL is required for production parity.");
  }
  const comparison = compareRegistryParity(registry, databaseRows);
  const anomalyFailures = registryAnomalyFailures(
    audit,
    comparison,
    baseline?.counts?.rawRows ?? baseline?.counts?.registryRows ?? 0,
  );
  const sourceHash = audit.source.sha256;
  if (!sourceHash)
    throw new Error("Fresh official source SHA-256 is unavailable.");
  const sourceIdentityMatchesBaseline =
    Boolean(baseline?.source?.sha256) &&
    baseline?.source?.sha256 === sourceHash;
  const fullExportPlan = {
    officialRows: registry.rows.length,
    plannedProductRows: registry.rows.length,
    uniquePlannedRegistryIds: new Set(
      registry.rows.map((row) => row.registryId),
    ).size,
    silentlyExcludedByMappingStatus: 0,
    approvedMappingRows: plan.approvedReviewableRows.length,
    reviewOnlyMappingRows: plan.reviewOnlyRows.length,
    quarantinedMappingRows: plan.quarantinedRows.length,
    productPlanComplete:
      registry.rows.length === registry.parsedRows &&
      new Set(registry.rows.map((row) => row.registryId)).size ===
        registry.rows.length,
  };
  if (!fullExportPlan.productPlanComplete)
    anomalyFailures.push("full_export_plan_incomplete");

  if (flag("--apply") && !databaseRows) {
    throw new Error("DATABASE_URL is required for an apply run.");
  }
  const applyResult = flag("--apply")
    ? await applySync({
        registry,
        databaseRows: databaseRows ?? [],
        sourceHash,
        sourceUrl: audit.source.sourceUrl ?? "official-file",
        downloadedAt: audit.source.downloadedAt ?? audit.asOf,
        anomalyFailures,
      })
    : null;
  const report = {
    schemaVersion: "official-registry-parity-v1",
    generatedAt: new Date().toISOString(),
    mode: applyResult ? "apply" : "dry-run",
    official: audit,
    baseline: {
      report: baselinePath,
      sha256: baseline?.source?.sha256 ?? null,
      rows: baseline?.counts?.rawRows ?? baseline?.counts?.registryRows ?? null,
      sourceIdentityMatchesFreshExport: sourceIdentityMatchesBaseline,
      note: "The fresh live export is always downloaded first; the checked-in report is comparison metadata, not the source of truth.",
    },
    productionBefore: comparison,
    plannedAfter: plannedAfterParity(registry.rows.length),
    fullExportPlan,
    anomalyGate: {
      ok: anomalyFailures.length === 0,
      failures: [...new Set(anomalyFailures)],
      policy: {
        minimumOfficialRows: 15_000,
        maximumRowDropPct: 5,
        maximumMissingPct: 2,
        maximumChangedPct: 20,
      },
    },
    apply: applyResult,
    productionWritePerformed: Boolean(applyResult),
  };
  const output = argValue("--output=") ?? DEFAULT_REPORT;
  if (!flag("--no-write-report")) {
    writeFileSync(
      resolve(output),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
  console.log(JSON.stringify(report, null, 2));
  if (audit.failures.length > 0 || !fullExportPlan.productPlanComplete)
    process.exit(1);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
