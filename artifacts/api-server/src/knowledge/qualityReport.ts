import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { validateKnowledge } from "./validation";
import { buildStaticBackfillSnapshot, backfillCounts } from "./backfill";
import {
  getKnowledgeRuntimeStatus,
  getRuntimeRegistryCounts,
  type KnowledgeRuntimeStatus,
  type RegistryRuntimeCounts,
} from "./dbRuntime";
import { getReviewStats } from "./reviewWorkflow";
import { buildDictionaryBatchSummary } from "./import/batches";
import { buildBulkIngestReport } from "./ingestion/report";

export interface ProductionDatabaseSnapshot {
  source: "db" | "static";
  products: number | null;
  manufacturers: number | null;
  registrations: number | null;
  approvedMappings: number | null;
  dbConfigured: boolean;
  dbAvailable: boolean;
  dbSchemaStatus: KnowledgeRuntimeStatus["dbSchemaStatus"];
  warnings: string[];
}

export type ProductionDatabaseSnapshotRuntime = Pick<
  KnowledgeRuntimeStatus,
  | "runtimeMode"
  | "databaseUrlConfigured"
  | "dbAvailable"
  | "dbSchemaStatus"
  | "warnings"
>;

export const PRODUCTION_DATABASE_COUNTS_UNAVAILABLE_WARNING =
  "Production database aggregate counts are unavailable; static fallback remains active.";

export function buildProductionDatabaseSnapshot(
  runtime: ProductionDatabaseSnapshotRuntime,
  registryCounts: RegistryRuntimeCounts | null,
): ProductionDatabaseSnapshot {
  const databaseReady =
    runtime.runtimeMode === "db" &&
    runtime.dbAvailable &&
    runtime.dbSchemaStatus === "ready";
  const databaseSnapshot = databaseReady && registryCounts !== null;

  return {
    source: databaseSnapshot ? "db" : "static",
    products: databaseSnapshot ? registryCounts.products : null,
    manufacturers: databaseSnapshot ? registryCounts.manufacturers : null,
    registrations: databaseSnapshot ? registryCounts.registrations : null,
    approvedMappings: databaseSnapshot ? registryCounts.approvedMappings : null,
    dbConfigured: runtime.databaseUrlConfigured,
    dbAvailable: runtime.dbAvailable,
    dbSchemaStatus: runtime.dbSchemaStatus,
    warnings: [
      ...new Set([
        ...runtime.warnings,
        ...(databaseReady && !registryCounts
          ? [PRODUCTION_DATABASE_COUNTS_UNAVAILABLE_WARNING]
          : []),
      ]),
    ],
  };
}

export interface DataQualityApiReport extends ReturnType<typeof validateKnowledge> {
  productionSnapshot: ProductionDatabaseSnapshot;
}

export interface KnowledgeQualityJsonReport {
  version: "0.9";
  timestamp: string;
  counts: ReturnType<typeof backfillCounts>;
  coverage: {
    mappingProvenancePct: number;
    atcCoveragePct: number;
    sourceCoveragePct: number;
    approvedMappingPct: number;
  };
  runtime: Awaited<ReturnType<typeof getKnowledgeRuntimeStatus>>;
  review: Awaited<ReturnType<typeof getReviewStats>>;
  dictionaryBatches: ReturnType<typeof buildDictionaryBatchSummary>;
  ingestion: ReturnType<typeof buildBulkIngestReport>;
  warnings: string[];
  validation: ReturnType<typeof validateKnowledge>;
}

function pct(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 100);
}

export async function buildDataQualityApiReport(): Promise<DataQualityApiReport> {
  const [runtime] = await Promise.all([getKnowledgeRuntimeStatus()]);
  const registryCounts =
    runtime.runtimeMode === "db" && runtime.dbAvailable
      ? await getRuntimeRegistryCounts()
      : null;

  return {
    ...validateKnowledge(),
    productionSnapshot: buildProductionDatabaseSnapshot(runtime, registryCounts),
  };
}

export async function buildKnowledgeQualityJsonReport(): Promise<KnowledgeQualityJsonReport> {
  const validation = validateKnowledge();
  const snapshot = buildStaticBackfillSnapshot();
  const counts = backfillCounts(snapshot);
  const runtime = await getKnowledgeRuntimeStatus();
  const review = await getReviewStats();
  const namesWithProvenance = snapshot.names.filter(
    (name) => name.sourceKey && name.evidenceLevel,
  ).length;
  const ingredientsWithAtc = snapshot.ingredients.filter(
    (ingredient) => ingredient.atcCode,
  ).length;
  const sourceKeys = new Set(snapshot.sources.map((source) => source.key));
  const rowsWithKnownSource = [
    ...snapshot.names.map((row) => row.sourceKey),
    ...snapshot.ingredients.map((row) => row.sourceKey),
    ...snapshot.atcCodes.map((row) => row.sourceKey),
    ...snapshot.interactionRules.map((row) => row.sourceKey),
  ].filter((key) => sourceKeys.has(key)).length;
  const rowsWithSource =
    snapshot.names.length +
    snapshot.ingredients.length +
    snapshot.atcCodes.length +
    snapshot.interactionRules.length;
  const approvedMappings = snapshot.names.filter(
    (name) => name.reviewStatus === "approved",
  ).length;

  return {
    version: "0.9",
    timestamp: new Date().toISOString(),
    counts,
    coverage: {
      mappingProvenancePct: pct(namesWithProvenance, snapshot.names.length),
      atcCoveragePct: pct(ingredientsWithAtc, snapshot.ingredients.length),
      sourceCoveragePct: pct(rowsWithKnownSource, rowsWithSource),
      approvedMappingPct: pct(approvedMappings, snapshot.names.length),
    },
    runtime,
    review,
    dictionaryBatches:
      validation.dictionaryBatches ?? buildDictionaryBatchSummary(),
    ingestion: validation.ingestion ?? buildBulkIngestReport(),
    warnings: [
      ...validation.warnings.map((warning) => warning.message),
      ...runtime.warnings,
      ...review.warnings,
    ],
    validation,
  };
}

export async function writeKnowledgeQualityJsonReport(
  path: string,
): Promise<void> {
  const report = await buildKnowledgeQualityJsonReport();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}
