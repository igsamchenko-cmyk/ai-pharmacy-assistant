import { readFileSync } from "node:fs";
import { resolveDataFilePath } from "../lib/dataPath";

export type RegistryParityStatus =
  | "exact"
  | "mismatch"
  | "pending_database_audit";

export interface RegistrySyncDashboardStatus {
  lastSyncedAt: string | null;
  sourceHash: string | null;
  officialRows: number;
  farmAssistRows: number;
  parityStatus: RegistryParityStatus;
  missingCount: number | null;
  extraCount: number | null;
  changedCount: number | null;
}

interface StaticParityReport {
  official?: {
    source?: { downloadedAt?: string | null; sha256?: string | null };
    rows?: { valid?: number };
  };
  productionBefore?: {
    missingOfficialRows?: number | null;
    extraFarmAssistRows?: number | null;
    changed?: { any?: number } | null;
    exactParity?: boolean | null;
  };
}

function staticReport(): StaticParityReport | null {
  const candidates = [
    "../../artifacts/reports/official-registry-parity-report.json",
    "artifacts/reports/official-registry-parity-report.json",
    "../reports/official-registry-parity-report.json",
  ];
  for (const candidate of candidates) {
    try {
      const path = resolveDataFilePath(candidate, {
        moduleUrl: import.meta.url,
      });
      return JSON.parse(readFileSync(path, "utf8")) as StaticParityReport;
    } catch {
      // Try the next repository/runtime layout.
    }
  }
  return null;
}

function staticStatus(farmAssistRows: number): RegistrySyncDashboardStatus {
  const report = staticReport();
  const comparison = report?.productionBefore;
  return {
    lastSyncedAt: report?.official?.source?.downloadedAt ?? null,
    sourceHash: report?.official?.source?.sha256 ?? null,
    officialRows: report?.official?.rows?.valid ?? 0,
    farmAssistRows,
    parityStatus:
      comparison?.exactParity === true
        ? "exact"
        : comparison?.exactParity === false
          ? "mismatch"
          : "pending_database_audit",
    missingCount: comparison?.missingOfficialRows ?? null,
    extraCount: comparison?.extraFarmAssistRows ?? null,
    changedCount: comparison?.changed?.any ?? null,
  };
}

export async function getRegistrySyncDashboardStatus(
  farmAssistRows: number,
): Promise<RegistrySyncDashboardStatus> {
  if (!process.env.DATABASE_URL) return staticStatus(farmAssistRows);
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{
      source_timestamp: Date | string;
      source_hash: string;
      official_rows: number;
      farmassist_rows_after: number | null;
      parity_status: string;
      missing_count: number;
      extra_count: number;
      changed_count: number;
    }>(
      `SELECT source_timestamp, source_hash, official_rows,
              farmassist_rows_after, parity_status, missing_count,
              extra_count, changed_count
         FROM knowledge_registry_sync_runs
        WHERE status = 'completed'
        ORDER BY completed_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return staticStatus(farmAssistRows);
    const sourceTimestamp =
      row.source_timestamp instanceof Date
        ? row.source_timestamp.toISOString()
        : row.source_timestamp;
    return {
      lastSyncedAt: sourceTimestamp,
      sourceHash: row.source_hash,
      officialRows: Number(row.official_rows),
      farmAssistRows: Number(row.farmassist_rows_after ?? farmAssistRows),
      parityStatus: row.parity_status === "exact" ? "exact" : "mismatch",
      missingCount: Number(row.missing_count),
      extraCount: Number(row.extra_count),
      changedCount: Number(row.changed_count),
    };
  } catch {
    return staticStatus(farmAssistRows);
  }
}
