const EXPECTED_WORKFLOW = "Official registry parity and gated sync";
const EXPECTED_REPOSITORY = "igsamchenko-cmyk/ai-pharmacy-assistant";
const EXPECTED_PURPOSE = "production-registry-audit-reconciliation";
const EXPECTED_ENVIRONMENT = "production-registry-sync";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface RegistryAuditReconciliationEnvironment {
  [key: string]: string | undefined;
}

export interface RegistryAuditReconciliationSnapshot {
  officialRows: number;
  currentRows: number;
  staleRows: number;
  searchableRows: number;
  missingRows: number;
  unintendedCurrentExtras: number;
  changedRows: number;
  hiddenRows: number;
  snapshotHashes: number;
  minHash: string | null;
  maxHash: string | null;
  exactParity: boolean;
}

export interface RegistryAuditReconciliationExecutor {
  query(
    text: string,
    values?: unknown[],
  ): PromiseLike<{ rows: Array<Record<string, unknown>> }>;
}

export interface RegistryAuditReconciliationRecord {
  id: string;
  sourceUrl: string;
  sourceHash: string;
  sourceTimestamp: string;
  officialRows: number;
  currentRows: number;
}

export function assertProtectedRegistryAuditReconciliationContext(
  env: RegistryAuditReconciliationEnvironment,
): string {
  const confirmedSha = env.CONFIRM_REGISTRY_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const auditedSha = env.AUDITED_REGISTRY_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const confirmationInput =
    env.CONFIRM_PRODUCTION_RECONCILE_INPUT?.toLowerCase() ?? "";
  const confirmationSecret =
    env.CONFIRM_PRODUCTION_REGISTRY_RECONCILE?.toLowerCase() ?? "";
  const requirements = [
    env.REGISTRY_PRODUCTION_AUDIT_RECONCILIATION === "true",
    SHA256_PATTERN.test(confirmedSha),
    SHA256_PATTERN.test(auditedSha),
    SHA256_PATTERN.test(confirmationInput),
    SHA256_PATTERN.test(confirmationSecret),
    confirmedSha === auditedSha,
    confirmationInput === auditedSha,
    confirmationSecret === auditedSha,
    env.REGISTRY_SYNC_MODE === "reconcile",
    env.REGISTRY_SYNC_PURPOSE === EXPECTED_PURPOSE,
    env.REGISTRY_SYNC_ENVIRONMENT === EXPECTED_ENVIRONMENT,
    env.GITHUB_ACTIONS === "true",
    env.GITHUB_WORKFLOW === EXPECTED_WORKFLOW,
    env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY,
    env.GITHUB_EVENT_NAME === "workflow_dispatch",
    env.GITHUB_REF === "refs/heads/main",
    /^\d+$/.test(env.GITHUB_RUN_ID ?? ""),
  ];
  if (requirements.some((requirement) => !requirement)) {
    throw new Error(
      "Registry audit reconciliation refused the unprotected production context.",
    );
  }
  return confirmedSha;
}

export function authorizeRegistryAuditReconciliationDatabase(
  rawDatabaseUrl: string | undefined,
  env: RegistryAuditReconciliationEnvironment,
): string {
  if (!rawDatabaseUrl) {
    throw new Error("Production database configuration is required.");
  }
  const host = new URL(rawDatabaseUrl).hostname.toLowerCase();
  if (!host.includes("render.com") && !host.includes("render-postgres")) {
    throw new Error(
      "Registry audit reconciliation requires the Render production host.",
    );
  }
  return assertProtectedRegistryAuditReconciliationContext(env);
}

export function assertRegistryAuditReconciliationSnapshot(
  snapshot: RegistryAuditReconciliationSnapshot,
  confirmedSha: string,
  minimumOfficialRows = 16_000,
): void {
  const exactSha = confirmedSha.toLowerCase();
  const integers = [
    snapshot.officialRows,
    snapshot.currentRows,
    snapshot.staleRows,
    snapshot.searchableRows,
    snapshot.missingRows,
    snapshot.unintendedCurrentExtras,
    snapshot.changedRows,
    snapshot.hiddenRows,
    snapshot.snapshotHashes,
  ];
  const valid =
    integers.every((value) => Number.isInteger(value) && value >= 0) &&
    snapshot.officialRows >= minimumOfficialRows &&
    snapshot.currentRows === snapshot.officialRows &&
    snapshot.searchableRows === snapshot.currentRows &&
    snapshot.missingRows === 0 &&
    snapshot.unintendedCurrentExtras === 0 &&
    snapshot.changedRows === 0 &&
    snapshot.hiddenRows === 0 &&
    snapshot.snapshotHashes === 1 &&
    snapshot.minHash?.toLowerCase() === exactSha &&
    snapshot.maxHash?.toLowerCase() === exactSha &&
    snapshot.exactParity;
  if (!valid) {
    throw new Error("Registry audit reconciliation parity gate failed.");
  }
}

export async function appendRegistryAuditReconciliation(
  executor: RegistryAuditReconciliationExecutor,
  record: RegistryAuditReconciliationRecord,
): Promise<Record<string, unknown>> {
  const result = await executor.query(
    `INSERT INTO knowledge_registry_sync_runs (
       id, mode, status, source_url, source_hash, source_timestamp,
       official_rows, farmassist_rows_before, farmassist_rows_after,
       missing_count, extra_count, changed_count, stale_marked_count,
       parity_status, anomaly_failures, checkpoint_source_hash,
       checkpoint_artifact, created_at, completed_at
     )
     SELECT $1, 'reconcile', 'completed', $2, $3, $4::timestamptz,
            $5, $6, $6, 0, 0, 0, 0, 'exact', '[]',
            failed.checkpoint_source_hash, failed.checkpoint_artifact,
            NOW(), NOW()
       FROM knowledge_registry_sync_runs failed
      WHERE failed.id = (
        SELECT id
          FROM knowledge_registry_sync_runs
         WHERE mode = 'apply'
           AND source_hash = $3
           AND status = 'failed'
         ORDER BY completed_at DESC NULLS LAST, created_at DESC
         LIMIT 1
      )
        AND failed.farmassist_rows_after = $6
        AND NOT EXISTS (
          SELECT 1
            FROM knowledge_registry_sync_runs
           WHERE mode = 'reconcile'
             AND source_hash = $3
             AND status = 'completed'
             AND parity_status = 'exact'
        )
     RETURNING id, status, parity_status, source_hash, official_rows,
               farmassist_rows_after, missing_count, extra_count,
               changed_count, completed_at::text`,
    [
      record.id,
      record.sourceUrl,
      record.sourceHash,
      record.sourceTimestamp,
      record.officialRows,
      record.currentRows,
    ],
  );
  const inserted = result.rows[0];
  if (!inserted) {
    throw new Error(
      "Registry audit reconciliation was not appended; source state was missing, changed, or already reconciled.",
    );
  }
  return inserted;
}
